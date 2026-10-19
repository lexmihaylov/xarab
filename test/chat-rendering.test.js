import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import React from "react";
import { render, renderToString } from "ink";
import { App } from "../src/ui/app.component.jsx";
import { ChatPanel } from "../src/ui/components/chat-panel.component.jsx";
import { buildChatRows, chatViewport } from "../src/ui/chat-layout.js";

function colorCells(output, width) {
  let foreground, background;
  let bold = false;
  const rows = [[]];
  for (const token of output.match(/\u001b\[[\d;]*m|[^\u001b]/gu) ?? []) {
    if (token.startsWith("\u001b[")) {
      const codes = token.slice(2, -1).split(";").map(Number);
      for (let index = 0; index < codes.length; index++) {
        const code = codes[index];
        if (code === 0) {
          foreground = undefined;
          background = undefined;
          bold = false;
        } else if (code === 1) bold = true;
        else if (code === 22) bold = false;
        else if (code === 39) foreground = undefined;
        else if (code === 49) background = undefined;
        else if ((code === 38 || code === 48) && codes[index + 1] === 2) {
          const color = codes.slice(index + 2, index + 5).join(",");
          if (code === 38) foreground = color;
          else background = color;
          index += 4;
        }
      }
    } else if (token === "\n") rows.push([]);
    else rows.at(-1).push({ text: token, foreground, background, bold });
  }
  return rows.map((row) => [
    ...row,
    ...Array.from({ length: Math.max(0, width - row.length) }, () => ({
      text: " ",
      foreground: undefined,
      background: undefined,
      bold: false,
    })),
  ]);
}

test("scrolling preserves padding backgrounds, border colors and heading styles at every boundary", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import React from "react";
    import { renderToString } from "ink";
    import { buildChatRows, chatViewport } from "./src/ui/chat-layout.js";
    import { ChatPanel } from "./src/ui/components/chat-panel.component.jsx";
    const rows = buildChatRows([
      { type: "user", message: "first user line\\nsecond user line" },
      { type: "system", severity: "warning", message: "first notice\\nsecond notice" },
      { type: "agent", message: "Final response." },
    ], 24);
    const draw = (lines, height) => renderToString(React.createElement(ChatPanel, { lines, width: 24, height }));
    const frames = Array.from({ length: rows.length - 2 }, (_, offset) => draw(chatViewport(rows, 3, offset).visibleLines, 3));
    process.stdout.write(JSON.stringify({ full: draw(rows, rows.length), frames, count: rows.length }));
  `,
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, FORCE_COLOR: "3" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const { full, frames, count } = JSON.parse(result.stdout);
  const fullCells = colorCells(full, 24);
  assert.ok(
    fullCells.some((row) => row.some((cell) => cell.background === "38,59,47")),
    "User padding must retain its background",
  );
  assert.ok(
    fullCells.some((row) => row.some((cell) => cell.background === "44,38,31")),
    "System padding must retain its background",
  );
  frames.forEach((frame, offset) => {
    assert.deepEqual(
      colorCells(frame, 24),
      fullCells.slice(count - offset - 3, count - offset),
      `offset=${offset}`,
    );
  });
});

test("live chat remains aligned when paging, expanding the composer, and resizing the terminal", async (t) => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  stdout.isTTY = true;
  stdout.columns = 60;
  stdout.rows = 24;
  stdout.resume();
  const stderr = new PassThrough();
  stderr.resume();
  let frame = [];
  stdout.on("data", (chunk) => {
    const text = stripVTControlCharacters(chunk.toString());
    if (text.includes("Enter send")) frame = text.split("\n").slice(0, stdout.rows);
  });
  const messages = Array.from({ length: 4 }, (_, index) => [
    {
      type: "user",
      message: `User ${index}: a longer request that wraps in smaller terminals.\nKeep this padding.`,
    },
    { type: "system", severity: "warning", message: `Notice ${index}: check this detail.` },
    { type: "agent", message: `Response ${index}: the result is ready.` },
  ]).flat();
  const state = {
    messages,
    modelPath: "No model selected",
    model: null,
    status: "Ready",
    generating: false,
  };
  const instance = render(
    React.createElement(App, { state, onSubmit() {}, onEscape() {}, onInterrupt() {} }),
    {
      stdin,
      stdout,
      stderr,
      debug: true,
      patchConsole: false,
      exitOnCtrlC: false,
    },
  );
  t.after(() => {
    instance.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });
  const press = async (key) => {
    stdin.write(key);
    await delay(60);
  };
  const assertViewport = (inputRows, offset = 0) => {
    const height = stdout.rows - inputRows - 5;
    const rows = buildChatRows(messages, stdout.columns);
    const viewport = chatViewport(rows, height, offset);
    const expected = stripVTControlCharacters(
      renderToString(
        React.createElement(ChatPanel, {
          lines: viewport.visibleLines,
          width: stdout.columns,
          height,
        }),
      ),
    ).split("\n");
    assert.deepEqual(frame.slice(0, height), expected);
    return viewport;
  };
  await delay(100);
  assertViewport(1);
  const initial = frame;
  await press("\u001b[<64;12;19M");
  assert.deepEqual(frame, initial, "Mouse scrolling over the composer must not move the chat");
  await press("\u001b[<64;12;1M");
  assertViewport(1, 3);
  await press("\u001b[6~");
  assert.deepEqual(frame, initial);
  await press("\u001b[5~");
  assertViewport(1, 17);
  await press("\u001b[6~");
  assert.deepEqual(frame, initial, "Paging back to the bottom restores exactly the same frame");
  await press("first");
  await press("\u000e");
  await press("second");
  await press("\u000e");
  await press("third");
  assertViewport(3);
  await press("\r");
  assert.deepEqual(frame, initial, "Clearing the expanded composer restores the original padding");
  stdout.columns = 30;
  stdout.rows = 18;
  stdout.emit("resize");
  await delay(150);
  assertViewport(1);
  await press("\u001b[5~");
  assertViewport(1, 11);
  stdout.columns = 100;
  stdout.rows = 80;
  stdout.emit("resize");
  await delay(150);
  assertViewport(1);
  stdout.columns = 60;
  stdout.rows = 24;
  stdout.emit("resize");
  await delay(150);
  assert.deepEqual(frame, initial, "Restoring terminal dimensions does not leave stale rows");
});
