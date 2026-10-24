import assert from "node:assert/strict";
import test from "node:test";
import { createOpenRouterWorkerAdapter } from "../src/agent/worker/openrouter-worker-adapter.js";

function stream(events) {
  const body = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  return new Response(
    new ReadableStream({
      start(controller) {
        // Split across SSE boundaries to exercise incremental parsing.
        for (const char of body) controller.enqueue(new TextEncoder().encode(char));
        controller.close();
      },
    }),
  );
}

test("streams text with bearer authorization", async () => {
  let request;
  const adapter = createOpenRouterWorkerAdapter({
    getApiKey: () => "test-secret",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return stream([{ choices: [{ delta: { content: "Hi" } }] }]);
    },
  });
  const chunks = [];
  await adapter.run({
    model: "vendor/model",
    input: "Hello",
    onTextDelta: (chunk) => chunks.push(chunk),
  });
  assert.deepEqual(chunks, ["Hi"]);
  assert.equal(request.options.headers.authorization, "Bearer test-secret");
  assert.equal(JSON.parse(request.options.body).model, "vendor/model");
  assert.deepEqual(JSON.parse(request.options.body).messages, [{ role: "user", content: "Hello" }]);
});

test("reports OpenRouter rejection details without exposing secrets", async () => {
  const adapter = createOpenRouterWorkerAdapter({
    getApiKey: () => "test-secret",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          error: { message: "Rate limit reached for upstream provider", code: 429 },
        }),
        { status: 429, headers: { "content-type": "application/json", "retry-after": "12" } },
      ),
  });
  await assert.rejects(adapter.run({ model: "vendor/model", input: "Hello" }), (error) => {
    assert.match(error.message, /OpenRouter request failed \(429\)/);
    assert.match(error.message, /Rate limit reached for upstream provider/);
    assert.match(error.message, /Retry after 12 seconds/);
    assert.doesNotMatch(error.message, /test-secret/);
    return true;
  });
});

test("marks stable instructions and tools for any model across tool continuation", async () => {
  const requests = [];
  const adapter = createOpenRouterWorkerAdapter({
    getApiKey: () => "key",
    fetchImpl: async (_, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1)
        return stream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, id: "call-1", function: { name: "read_file", arguments: "{}" } },
                  ],
                },
              },
            ],
          },
        ]);
      return stream([{ choices: [{ delta: { content: "Done" } }] }]);
    },
  });
  await adapter.run({
    model: "vendor/model",
    instructions: "Stable instructions",
    input: "Read",
    tools: {
      read_file: { description: "Read", handler: async () => "content" },
      other_tool: { description: "Other", handler: async () => "other" },
    },
  });
  assert.deepEqual(requests[0].messages[0], {
    role: "system",
    content: [{ type: "text", text: "Stable instructions", cache_control: { type: "ephemeral" } }],
  });
  assert.deepEqual(requests[1].messages[0], requests[0].messages[0]);
  assert.equal(requests[0].tools[0].cache_control, undefined);
  assert.deepEqual(requests[0].tools.at(-1).cache_control, { type: "ephemeral" });
  assert.deepEqual(requests[1].tools, requests[0].tools);
  assert.equal(requests[1].messages.at(-1).content, "content");
  assert.equal(requests[1].messages.at(-1).cache_control, undefined);
});

test("executes tool calls and returns a follow-up response", async () => {
  const requests = [];
  const events = [];
  const adapter = createOpenRouterWorkerAdapter({
    getApiKey: () => "key",
    fetchImpl: async (_, options) => {
      requests.push(JSON.parse(options.body));
      if (requests.length === 1)
        return stream([
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      id: "call-1",
                      function: { name: "read_file", arguments: '{"path":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              { delta: { tool_calls: [{ index: 0, function: { arguments: '"README.md"}' } }] } },
            ],
          },
        ]);
      return stream([{ choices: [{ delta: { content: "Done" } }] }]);
    },
  });
  const chunks = [];
  await adapter.run({
    model: "vendor/model",
    input: "Read",
    tools: {
      read_file: { description: "Read", handler: async () => ({ ok: true, output: "content" }) },
    },
    onEvent: (event) => events.push(event),
    onTextDelta: (chunk) => chunks.push(chunk),
  });
  assert.equal(requests[1].messages.at(-1).content, "content");
  assert.deepEqual(chunks, ["Done"]);
  assert.deepEqual(
    events.map((event) => event.type),
    ["tool_call", "tool_result"],
  );
});
