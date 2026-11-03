import test from "node:test";
import assert from "node:assert/strict";
import { createOpenAIResponsesWorkerAdapter } from "../src/agent/worker/openai-responses-worker-adapter.js";

function response(output) {
  return new Response(
    `data: ${JSON.stringify({ type: "response.completed", response: { output } })}\n\n`,
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("OpenAI overlaps adjacent tasks and keeps ordered outputs across barriers", async () => {
  let requests = 0;
  const starts = [];
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const adapter = createOpenAIResponsesWorkerAdapter({
    getCredentials: async () => ({ accessToken: "test" }),
    fetchImpl: async (_, options) => {
      if (requests++ === 0)
        return response(
          ["task", "task", "read_file"].map((name, index) => ({
            type: "function_call",
            name,
            call_id: String(index),
            arguments: JSON.stringify({ index }),
          })),
        );
      const outputs = JSON.parse(options.body).input.filter(
        (item) => item.type === "function_call_output",
      );
      assert.deepEqual(
        outputs.map((item) => item.output),
        ["0", "1", "read"],
      );
      return response([{ type: "message", content: [{ type: "output_text", text: "Done" }] }]);
    },
  });
  await adapter.run({
    model: "test",
    input: [],
    tools: {
      task: {
        handler: async ({ index }) => {
          starts.push(index);
          if (index === 0) await gate;
          else release();
          return String(index);
        },
      },
      read_file: {
        handler: async () => {
          assert.deepEqual(starts, [0, 1]);
          return "read";
        },
      },
    },
  });
  assert.equal(requests, 2);
});
