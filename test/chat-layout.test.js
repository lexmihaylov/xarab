import assert from "node:assert/strict";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import React from "react";
import { renderToString } from "ink";
import { buildChatRows, chatViewport } from "../src/ui/chat-layout.js";
import { ChatPanel } from "../src/ui/components/chat-panel.component.jsx";

const plain = stripVTControlCharacters;
const messages = [
  { type: "user", message: "Please inspect this longer message.\nKeep its padding." },
  { type: "system", severity: "warning", message: "A system notice.\nWith another line." },
  { type: "system", severity: "info", message: "A separate notice." },
  { type: "shell", message: "shell output that must not lose its final characters" },
  {
    type: "agent",
    parts: [
      { type: "text", text: "Checking the files." },
      {
        type: "tool",
        status: "complete",
        title: "Read a file with a longer name",
        summary: "Finished reading it.",
      },
      { type: "text", text: "All done." },
    ],
  },
];

function renderRows(rows, width, height = rows.length) {
  return plain(
    renderToString(React.createElement(ChatPanel, { lines: rows, width, height })),
  ).split("\n");
}

test("user padding is counted once per message, not once per wrapped line", () => {
  const rows = buildChatRows([{ type: "user", message: "a".repeat(32) + "\nlast" }], 14);
  const user = rows.filter((row) => row.type === "user");
  assert.equal(user.filter((row) => row.isPadding).length, 2);
  assert.equal(user[0].isPadding, true);
  assert.equal(user.at(-1).isPadding, true);
  const body = user.filter((row) => !row.isPadding).map((row) => plain(row.text));
  assert.deepEqual(body, ["a".repeat(11), "a".repeat(11), "a".repeat(10), "last"]);
  assert.equal(rows.length, 7, "Four content rows, two padding rows, and a spacer");
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
});

test("system headings and padding are part of layout before scrolling", () => {
  const rows = buildChatRows(
    [
      { type: "system", severity: "warning", message: "first\nsecond" },
      { type: "system", severity: "info", message: "separate" },
    ],
    40,
  );
  assert.equal(rows.length, 11);
  assert.deepEqual(
    rows.filter((row) => row.isHeading).map((row) => plain(row.text)),
    ["System · Warning", "System"],
  );
  assert.equal(rows.filter((row) => row.isPadding).length, 4);
  const frame = renderRows(rows, 40);
  assert.equal(frame.length, rows.length);
  assert.equal(frame.filter((line) => line.includes("System")).length, 2);
});

test("every scrolled viewport exactly matches its slice of the fully rendered conversation", () => {
  for (const width of [14, 32]) {
    const rows = buildChatRows(messages, width);
    const full = renderRows(rows, width);
    assert.equal(full.length, rows.length);
    for (const height of [1, 4, 9]) {
      const max = chatViewport(rows, height).maxScroll;
      for (let offset = 0; offset <= max; offset++) {
        const viewport = chatViewport(rows, height, offset);
        const end = rows.length - offset;
        assert.deepEqual(
          renderRows(viewport.visibleLines, width, height),
          full.slice(end - height, end),
          `width=${width}, height=${height}, offset=${offset}`,
        );
      }
    }
  }
});

test("changing viewport height or wrapping clamps obsolete scroll offsets immediately", () => {
  const rows = buildChatRows(messages, 14);
  const oldOffset = chatViewport(rows, 4).maxScroll;
  const resized = buildChatRows(messages, 80);
  const viewport = chatViewport(resized, 10, oldOffset);
  assert.equal(viewport.scrollOffset, viewport.maxScroll);
  assert.deepEqual(viewport.visibleLines, resized.slice(0, 10));
  const short = buildChatRows([{ type: "user", message: "short" }], 80);
  assert.deepEqual(chatViewport(short, 10, oldOffset).visibleLines, short);
  assert.equal(chatViewport(short, 10, oldOffset).scrollOffset, 0);
});

test("shell and decorated tool headings wrap without truncating trailing characters", () => {
  const rows = buildChatRows(
    [
      { type: "shell", message: "a".repeat(30) },
      { type: "agent", parts: [{ type: "tool", status: "complete", title: "b".repeat(30) }] },
    ],
    14,
  );
  const rendered = renderRows(rows, 14).join("\n");
  assert.equal((rendered.match(/a/g) ?? []).length, 30);
  assert.equal((rendered.match(/b/g) ?? []).length, 30);
});

test("welcome rows are centered within the actual viewport and have stable keys", () => {
  const rows = buildChatRows([], 100, { height: 60 });
  assert.equal(rows.length, 60);
  assert.equal(new Set(rows.map((row) => row.key)).size, rows.length);
  assert.ok(rows[0].type === "welcome-space");
  assert.ok(rows.at(-1).type === "welcome-space");
});
