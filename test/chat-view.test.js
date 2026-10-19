import test from "node:test";
import assert from "node:assert/strict";
import { formatChatMessage, formatMessageLines } from "../src/ui/chat-view.js";

test("omits the user role label", () => {
  const output = formatChatMessage({
    type: "user",
    color: "#8fbfdc",
    message: "Please make this change.",
  });
  assert.doesNotMatch(output, /User/);
  assert.match(output, /Please make this change/);
});

test("renders Markdown only for agent messages", () => {
  const markdown = "**bold** and `code`";
  const agent = formatChatMessage({ type: "agent", message: markdown });
  const user = formatChatMessage({ type: "user", message: markdown });
  const system = formatChatMessage({ type: "system", message: markdown, color: "#aaa" });

  assert.match(agent, /\{bold\}bold\{\/bold\}/);
  assert.match(user, /\*\*bold\*\*/);
  assert.match(system, /\*\*bold\*\*/);
  assert.doesNotMatch(user, /\{bold\}/);
  assert.doesNotMatch(system.split("\n").at(-1), /\{bold\}/);
});

test("keeps shell command output distinct from system notices", () => {
  const lines = formatMessageLines({
    type: "shell",
    severity: "warning",
    message: "command output",
  });

  assert.deepEqual(lines, [{ text: "command output", type: "shell", severity: "warning" }]);
});

test("keeps assistant narration, inline tool cards, and follow-up in event order", () => {
  const lines = formatMessageLines({
    type: "agent",
    message: "I will check file.txt. Based on this I found that it is valid.",
    parts: [
      { type: "text", text: "I will check file.txt." },
      { type: "tool", label: "Reading file.txt", title: "Reading file.txt", status: "running" },
      {
        type: "tool",
        label: "Reading file.txt",
        title: "Read file.txt",
        status: "complete",
        summary: "Read file.txt (20 bytes)",
      },
      { type: "text", text: "Based on this I found that it is valid." },
    ],
  });

  assert.deepEqual(
    lines.map(({ type }) => type),
    [
      "agent",
      "tool-running",
      "tool-bottom",
      "spacer",
      "tool-complete",
      "tool-detail",
      "tool-bottom",
      "spacer",
      "agent",
    ],
  );
  assert.match(lines[0].text, /I will check file\.txt/);
  assert.match(lines.at(-1).text, /Based on this I found/);
});

test("renders edit diffs inline with added and removed line styles", () => {
  const lines = formatMessageLines({
    type: "agent",
    parts: [
      {
        type: "tool",
        label: "Editing file.txt",
        title: "Edited file.txt",
        status: "complete",
        summary: "1 replacement",
        diffText: "--- a/file.txt\n+++ b/file.txt\n@@ -1 +1 @@\n-old\n+new",
      },
    ],
  });
  assert.ok(lines.some(({ type, text }) => type === "tool-diff-old" && text === "-old"));
  assert.ok(lines.some(({ type, text }) => type === "tool-diff-new" && text === "+new"));
});

test("renders compaction as a generic inline tool activity", () => {
  const lines = formatMessageLines({
    type: "agent",
    message: "",
    parts: [{ type: "tool", title: "Compacting…", label: "Compacting…", status: "running" }],
  });
  assert.ok(lines.some(({ text, type }) => text === "Compacting…" && type === "tool-running"));
});

test("escapes tool labels so they cannot inject terminal style tags", () => {
  const output = formatMessageLines({
    type: "agent",
    message: "",
    parts: [{ type: "tool", title: "Reading {bold}README{/bold}", label: "", status: "running" }],
  })
    .map(({ text }) => text)
    .join("\n");
  assert.match(output, /\{open\}bold\{close\}README\{open\}\/bold\{close\}/);
});
