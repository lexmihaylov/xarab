import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerHistory } from "../src/agent/worker/worker.js";

test("historical task results retain the final response without child activity", () => {
  const messages = [
    { type: "user", message: "delegate" },
    {
      type: "agent",
      parts: [
        {
          type: "tool",
          toolName: "task",
          callId: "task-1",
          params: { brief: "review" },
          taskActivity: [
            { callId: "child-1", label: "Executing secret child command", status: "complete" },
          ],
          result: { ok: false, output: "task final response" },
        },
        {
          type: "tool",
          toolName: "read_file",
          callId: "read-1",
          params: {},
          result: { ok: true, output: "ordinary result" },
        },
      ],
    },
  ];
  const history = buildWorkerHistory(messages, "next turn");
  const task = history.find((item) => item.type === "tool_result" && item.callId === "task-1");
  assert.equal(task.ok, false);
  assert.equal(task.output, "task final response");
  assert.doesNotMatch(JSON.stringify(history), /secret child command|child-1/);
  assert.match(JSON.stringify(history), /ordinary result/);
});
