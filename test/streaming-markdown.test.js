import assert from "node:assert/strict";
import test from "node:test";
import { splitStreamingMarkdown } from "../src/utils/streaming-markdown.js";

test("keeps incomplete inline constructs literal and releases preceding blocks", () => {
  for (const tail of [
    "**bold",
    "[link](https://example",
    "# heading",
    "paragraph",
    "- one\n\n- two",
  ]) {
    const source = `# Complete\n\n${tail}`;
    const result = splitStreamingMarkdown(source, true);
    assert.equal(result.markdown, "# Complete\n\n");
    assert.equal(result.tail, tail);
    assert.equal(result.markdown + result.tail, source);
  }
});

test("does not split on blank lines inside fences, lists, or quotes", () => {
  for (const source of ["```js\nx\n\ny", "~~~\nx\n\ny", "- one\n\n- two", "> one\n>\n> two"]) {
    assert.deepEqual(splitStreamingMarkdown(source, true), { markdown: "", tail: source });
  }
});

test("releases a closed fence only after a subsequent block arrives", () => {
  const fence = "```js\nx\n```\n\n";
  assert.equal(splitStreamingMarkdown(fence, true).markdown, "");
  assert.deepEqual(splitStreamingMarkdown(fence + "Next", true), {
    markdown: fence,
    tail: "Next",
  });
});

test("completion or interruption renders the entire original source as Markdown", () => {
  for (const source of [
    "",
    "**unfinished",
    "```js\nx",
    "[a][ref]\n\n[ref]: /url",
    "# Title\r\n\r\nTail",
  ]) {
    assert.deepEqual(splitStreamingMarkdown(source, false), { markdown: source, tail: "" });
  }
});

test("handles CRLF and reference definitions without losing source text", () => {
  for (const source of ["# Title\r\n\r\nTail", "[ref]: /url\n\nText\n\nNext"]) {
    const { markdown, tail } = splitStreamingMarkdown(source, true);
    assert.equal(markdown + tail, source.replace(/\r\n?/g, "\n"));
  }
});
