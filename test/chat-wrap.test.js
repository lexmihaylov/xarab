import assert from "node:assert/strict";
import test from "node:test";
import { wrapChatLine } from "../src/ui/chat-wrap.js";

const stripAnsi = (value) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");

test("wraps chat lines to the terminal width, including long words", () => {
  const lines = wrapChatLine("A long message with an extraordinarilylongword", 12).map(stripAnsi);
  assert.deepEqual(lines, ["A long ", "message with", " an ", "extraordinar", "ilylongword"]);
  assert.ok(lines.every((line) => line.length <= 12));
});
