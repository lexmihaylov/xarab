import test from "node:test";
import assert from "node:assert/strict";
import { renderMarkdown } from "../src/ui/markdown.js";
import { toAnsi } from "../src/ui/terminal-utils.js";

test("formats common Markdown constructs into terminal style tags", () => {
  const output = renderMarkdown(
    "# Heading\n\n**bold** and *italic* with `code`\n\n- item\n\n> quote\n\n```js\nconst value = 1;\n```\n",
  );

  assert.match(output, /\{bold\}.*Heading/);
  assert.match(output, /\{bold\}bold\{\/bold\}/);
  assert.match(output, /\{italic\}italic\{\/italic\}/);
  assert.match(output, /e6b17e-fg\}code/);
  assert.match(output, /•.*item/);
  assert.match(output, /│.*quote/);
  assert.match(output, /const.*value = /);
});

test("escapes model text that resembles terminal style markup", () => {
  const output = renderMarkdown("Literal {bold} text");
  assert.match(output, /\{open\}bold\{close\}/);
});

test("syntax highlights fenced code when a language is specified", () => {
  const output = renderMarkdown("```js\nconst answer = 42;\n```");
  assert.match(output, /#c792ea-fg/);
  assert.match(output, /#f78c6c-fg/);
  assert.match(output, /const.*answer = .*42/s);
});

test("formats links with distinct link text and a readable destination", () => {
  const output = renderMarkdown("[Project site](https://example.com/docs)");

  assert.match(output, /\{#8fbfdc-fg\}\{underline\}\{link:[^}]+\}Project site/);
  assert.match(output, /\(https:\/\/example\.com\/docs\)/);
});

test("does not repeat a URL when it is already the link text", () => {
  const output = renderMarkdown("https://example.com/docs");

  assert.equal(output.match(/https:\/\/example\.com\/docs/g)?.length, 1);
});

test("does not repeat a URL when the link text omits the protocol", () => {
  const output = renderMarkdown("[portal.registryagency.bg](https://portal.registryagency.bg)");

  assert.match(output, /portal\.registryagency\.bg/);
  assert.doesNotMatch(output, /https:\/\/portal\.registryagency\.bg/);
});

test("does not expose mailto targets next to readable email addresses", () => {
  const output = renderMarkdown("[office@example.com](mailto:office@example.com)");

  assert.match(output, /office@example\.com/);
  assert.doesNotMatch(output, /mailto:/);
});

test("renders safe Markdown links as clickable terminal hyperlinks", () => {
  const output = toAnsi(renderMarkdown("[Project site](https://example.com/docs)"));

  assert.match(output, /\u001b\]8;;https:\/\/example\.com\/docs\u001b\\Project site/);
  assert.match(output, /\u001b\]8;;\u001b\\/);
});

test("aligns Markdown table columns to their contents", () => {
  const output = renderMarkdown(
    "| Name | Description |\n| --- | --- |\n| Xarab | Local assistant |\n| App | A longer description |",
  );
  const lines = output
    .replace(/\{[^{}]*\}/g, "")
    .trim()
    .split("\n");

  assert.match(lines[0], /Name\s+│\s+Description/);
  assert.match(lines[1], /─{4,}┼─{11,}/);
  assert.match(lines[2], /Xarab\s+│\s+Local assistant/);
  assert.match(lines[3], /App\s+│\s+A longer description/);
});
