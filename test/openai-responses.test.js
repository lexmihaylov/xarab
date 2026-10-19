import assert from "node:assert/strict";
import test from "node:test";
import { createOpenAIResponsesAdapter } from "../src/agent/openai-responses.js";

function streamedResponse(events, { split = false } = {}) {
  const text = `${events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("")}data: [DONE]\n\n`;
  const chunks = split
    ? [...text].map((character) => new TextEncoder().encode(character))
    : [new TextEncoder().encode(text)];
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

test("lists models allowed for display by the signed-in account", async () => {
  const requests = [];
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token-secret", account_id: "account-1" }),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return Response.json({
        models: [
          { slug: "model-a", display_name: "Model A" },
          { slug: "model-b", display_name: "Model B" },
        ],
      });
    },
  });

  assert.deepEqual(await adapter.listModels(), [
    { id: "model-a", name: "Model A" },
    { id: "model-b", name: "Model B" },
  ]);
  assert.equal(requests[0].options.headers.authorization, "Bearer token-secret");
  assert.equal(
    requests[0].url,
    "https://chatgpt.com/backend-api/codex/models?client_version=0.0.0",
  );
  assert.equal(requests[0].options.headers["chatgpt-account-id"], "account-1");
});

test("streams a Responses result with required privacy settings", async () => {
  const requests = [];
  const chunks = [];
  const finalResponse = { id: "response-1", output: [{ type: "message" }] };
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token-secret", account_id: "account-1" }),
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      return streamedResponse(
        [
          { type: "response.output_text.delta", delta: "Hello" },
          { type: "response.output_text.delta", delta: ", world!" },
          { type: "response.completed", response: finalResponse },
        ],
        { split: true },
      );
    },
  });

  const response = await adapter.run({
    model: "model-a",
    instructions: "System instructions",
    input: [{ role: "user", content: "Say hello" }],
    onText: (chunk) => chunks.push(chunk),
  });

  assert.deepEqual(response, finalResponse);
  assert.deepEqual(chunks, ["Hello", ", world!"]);
  assert.equal(requests[0].url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(requests[0].options.headers.authorization, "Bearer token-secret");
  assert.equal(requests[0].options.headers["chatgpt-account-id"], "account-1");
  assert.equal(requests[0].options.headers.originator, "xarab");
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    model: "model-a",
    instructions: "System instructions",
    input: [{ role: "user", content: "Say hello" }],
    tools: [],
    parallel_tool_calls: false,
    store: false,
    stream: true,
    include: ["reasoning.encrypted_content"],
  });
});

test("does not leak streamed text that accompanies a native tool call", async () => {
  const chunks = [];
  let requestCount = 0;
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token", account_id: "account-1" }),
    fetchImpl: async () => {
      requestCount++;
      return requestCount === 1
        ? streamedResponse([
            { type: "response.output_text.delta", delta: "I will inspect this. " },
            {
              type: "response.completed",
              response: {
                output: [
                  { type: "function_call", name: "inspect", call_id: "call-1", arguments: "{}" },
                ],
              },
            },
          ])
        : streamedResponse([
            { type: "response.output_text.delta", delta: "Done." },
            { type: "response.completed", response: { output: [{ type: "message" }] } },
          ]);
    },
  });

  await adapter.run({
    model: "model-a",
    input: [],
    tools: { inspect: { description: "Inspect", handler: async () => "inspected" } },
    onText: (chunk) => chunks.push(chunk),
  });
  assert.deepEqual(chunks, ["Done."]);
});

test("rejects textual tool-call syntax without displaying it or executing it", async () => {
  for (const leakedText of [
    'to=functions.edit {"path":"file.js"}',
    'to=function.edit code {"path":"file.js"}',
    "recipient=functions.edit",
    "recipient_name=functions.edit",
  ]) {
    const chunks = [];
    let handlerCalls = 0;
    const adapter = createOpenAIResponsesAdapter({
      getCredentials: async () => ({ access_token: "token", account_id: "account-1" }),
      fetchImpl: async () =>
        streamedResponse([
          { type: "response.output_text.delta", delta: leakedText },
          { type: "response.completed", response: { output: [{ type: "message" }] } },
        ]),
    });
    await assert.rejects(
      adapter.run({
        model: "model-a",
        input: [],
        tools: { edit: { description: "Edit", handler: async () => handlerCalls++ } },
        onText: (chunk) => chunks.push(chunk),
      }),
      /textual tool call instead of a structured function call/,
    );
    assert.deepEqual(chunks, []);
    assert.equal(handlerCalls, 0);
  }
});

test("rejects textual tool-call syntax from completed output without streamed deltas", async () => {
  const textualCall = 'to=functions.edit code {"path":"file.js"}';
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token", account_id: "account-1" }),
    fetchImpl: async () =>
      streamedResponse([
        {
          type: "response.completed",
          response: {
            output: [{ type: "message", content: [{ type: "output_text", text: textualCall }] }],
          },
        },
      ]),
  });
  const chunks = [];

  await assert.rejects(
    adapter.run({ model: "model-a", input: [], onText: (chunk) => chunks.push(chunk) }),
    /textual tool call instead of a structured function call/,
  );
  assert.deepEqual(chunks, []);
});

test("runs provider function calls through existing tool handlers and continues the turn", async () => {
  const requests = [];
  const calls = [];
  let turn = 0;
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token-secret", account_id: "account-1" }),
    fetchImpl: async (url, options) => {
      requests.push(JSON.parse(options.body));
      turn++;
      if (turn === 1) {
        return streamedResponse([
          {
            type: "response.completed",
            response: {
              id: "response-tool",
              output: [
                {
                  type: "function_call",
                  name: "read_file",
                  call_id: "call-1",
                  arguments: '{"path":"README.md"}',
                },
              ],
            },
          },
        ]);
      }
      return streamedResponse([
        { type: "response.output_text.delta", delta: "File read." },
        {
          type: "response.completed",
          response: { id: "response-final", output: [{ type: "message" }] },
        },
      ]);
    },
  });

  const result = await adapter.run({
    model: "model-a",
    instructions: "System",
    input: [{ role: "user", content: "Read README" }],
    tools: {
      read_file: {
        description: "Read a workspace file",
        params: { type: "object", properties: { path: { type: "string" } } },
        async handler(args) {
          calls.push(args);
          return "README contents";
        },
      },
    },
  });

  assert.equal(result.id, "response-final");
  assert.deepEqual(calls, [{ path: "README.md" }]);
  assert.equal(requests.length, 2);
  assert.equal(requests[1].input.at(-2).type, "function_call");
  assert.deepEqual(requests[1].input.at(-1), {
    type: "function_call_output",
    call_id: "call-1",
    output: "README contents",
  });
});

test("continues a tool call when input is omitted and serializes unusual tool results", async () => {
  const requests = [];
  let requestCount = 0;
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token", account_id: "account-1" }),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      requestCount++;
      return requestCount === 1
        ? streamedResponse([
            {
              type: "response.completed",
              response: {
                output: [{ type: "function_call", name: "inspect", call_id: "call-1" }],
              },
            },
          ])
        : streamedResponse([
            {
              type: "response.completed",
              response: {
                output: [{ type: "message", content: [{ type: "output_text", text: "Done" }] }],
              },
            },
          ]);
    },
  });

  await adapter.run({
    model: "model-a",
    tools: { inspect: { description: "Inspect", handler: async () => undefined } },
  });

  assert.deepEqual(requests[1].input[0], {
    type: "function_call",
    name: "inspect",
    call_id: "call-1",
  });
  assert.deepEqual(requests[1].input[1], {
    type: "function_call_output",
    call_id: "call-1",
    output: "undefined",
  });
});

test("recovers final text from the completed response when the stream has no text deltas", async () => {
  let requestCount = 0;
  const chunks = [];
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token-secret", account_id: "account-1" }),
    fetchImpl: async () => {
      requestCount++;
      if (requestCount === 1)
        return streamedResponse([
          {
            type: "response.completed",
            response: {
              output: [
                {
                  type: "function_call",
                  name: "inspect",
                  call_id: "call-1",
                  arguments: "{}",
                },
              ],
            },
          },
        ]);
      return streamedResponse([
        {
          type: "response.completed",
          response: {
            id: "response-final",
            output: [
              {
                type: "message",
                content: [{ type: "output_text", text: "Here is the result." }],
              },
            ],
          },
        },
      ]);
    },
  });

  await adapter.run({
    model: "model-a",
    input: [{ role: "user", content: "Inspect" }],
    tools: { inspect: { description: "Inspect", handler: async () => "Done" } },
    onText: (chunk) => chunks.push(chunk),
  });

  assert.deepEqual(chunks, ["Here is the result."]);
});

test("reports an empty final response after a tool call instead of silently ending", async () => {
  let requestCount = 0;
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token-secret", account_id: "account-1" }),
    fetchImpl: async () => {
      requestCount++;
      return streamedResponse([
        {
          type: "response.completed",
          response: {
            output:
              requestCount === 1
                ? [
                    {
                      type: "function_call",
                      name: "inspect",
                      call_id: "call-1",
                      arguments: "{}",
                    },
                  ]
                : [],
          },
        },
      ]);
    },
  });

  await assert.rejects(
    adapter.run({
      model: "model-a",
      input: [{ role: "user", content: "Inspect" }],
      tools: { inspect: { description: "Inspect", handler: async () => "Done" } },
    }),
    /completed the turn after a tool call without a text response/,
  );
});

test("continues tool rounds without a fixed cap and keeps tools available", async () => {
  const requests = [];
  let requestCount = 0;
  let handlerCalls = 0;
  const toolRoundCount = 30;
  const adapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token-secret", account_id: "account-1" }),
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      requests.push(body);
      requestCount++;
      if (requestCount <= toolRoundCount) {
        return streamedResponse([
          {
            type: "response.completed",
            response: {
              output: [
                {
                  type: "function_call",
                  name: "inspect",
                  call_id: `call-${requestCount}`,
                  arguments: "{}",
                },
              ],
            },
          },
        ]);
      }
      return streamedResponse([
        {
          type: "response.completed",
          response: {
            id: "final-summary",
            output: [
              { type: "message", content: [{ type: "output_text", text: "Summary complete." }] },
            ],
          },
        },
      ]);
    },
  });

  const result = await adapter.run({
    model: "model-a",
    instructions: "Inspect the project carefully.",
    input: [],
    tools: {
      inspect: {
        description: "Inspect the project",
        params: { type: "object", properties: {} },
        async handler() {
          handlerCalls++;
          return "Inspection findings";
        },
      },
    },
  });

  assert.equal(result.id, "final-summary");
  assert.equal(requests.length, toolRoundCount + 1);
  assert.equal(handlerCalls, toolRoundCount);
  assert.ok(requests.every((request) => request.tools.length === 1));
  assert.ok(requests.every((request) => request.instructions === "Inspect the project carefully."));
});

test("surfaces response failures and rejects streams without a completed event", async () => {
  const failureAdapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token", account_id: "account-1" }),
    fetchImpl: async () =>
      streamedResponse([{ type: "response.failed", response: { error: { code: "usage_limit" } } }]),
  });
  await assert.rejects(
    failureAdapter.run({ model: "model-a", input: [] }),
    /response failed \(usage_limit\)/,
  );

  const incompleteAdapter = createOpenAIResponsesAdapter({
    getCredentials: async () => ({ access_token: "token", account_id: "account-1" }),
    fetchImpl: async () => streamedResponse([{ type: "response.created" }]),
  });
  await assert.rejects(
    incompleteAdapter.run({ model: "model-a", input: [] }),
    /without response.completed/,
  );
});
