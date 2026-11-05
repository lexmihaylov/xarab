import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createOpenAIResponsesWorkerAdapter } from "../src/agent/worker/openai-responses-worker-adapter.js";
import { createOpenRouterWorkerAdapter } from "../src/agent/worker/openrouter-worker-adapter.js";

const encoder = new TextEncoder();
const event = (value) => `data: ${JSON.stringify(value)}\n\n`;
const openAIComplete = event({
  type: "response.completed",
  response: { output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }] },
});
const routerComplete = `${event({ choices: [{ delta: { content: "done" } }] })}data: [DONE]\n\n`;
function response(text, close = true) {
  return new Response(
    new ReadableStream({
      start(controller) {
        if (text) controller.enqueue(encoder.encode(text));
        if (close) controller.close();
      },
    }),
  );
}
function adapter(provider, fetchImpl, options = {}) {
  return provider === "OpenAI"
    ? createOpenAIResponsesWorkerAdapter({
        getCredentials: async () => ({ access_token: "test", account_id: "test" }),
        fetchImpl,
        inactivityTimeoutMs: 15,
        ...options,
      })
    : createOpenRouterWorkerAdapter({
        getApiKey: () => "test",
        fetchImpl,
        inactivityTimeoutMs: 15,
        ...options,
      });
}

for (const provider of ["OpenAI", "OpenRouter"]) {
  const complete = provider === "OpenAI" ? openAIComplete : routerComplete;
  test(`${provider} retries a silent request and reports it`, async () => {
    let calls = 0;
    const events = [];
    const worker = adapter(provider, async () =>
      ++calls === 1 ? response("", false) : response(complete),
    );
    await worker.run({ model: "test", input: "hi", onEvent: (value) => events.push(value) });
    assert.equal(calls, 2);
    assert.equal(events.filter((value) => value.type === "provider_retry").length, 1);
  });

  test(`${provider} preserves partial text without retry`, async () => {
    let calls = 0;
    const chunks = [];
    const partial =
      provider === "OpenAI"
        ? event({ type: "response.output_text.delta", delta: "partial" })
        : event({ choices: [{ delta: { content: "partial" } }] });
    const worker = adapter(provider, async () => {
      calls++;
      return response(partial, false);
    });
    await assert.rejects(
      worker.run({ model: "test", input: "hi", onTextDelta: (text) => chunks.push(text) }),
      /Response stopped after partial output/,
    );
    assert.deepEqual(chunks, ["partial"]);
    assert.equal(calls, 1);
  });

  test(`${provider} retries only the request following a completed tool`, async () => {
    let calls = 0;
    let toolCalls = 0;
    const requests = [];
    const toolEvent =
      provider === "OpenAI"
        ? event({
            type: "response.completed",
            response: {
              output: [{ type: "function_call", name: "inspect", call_id: "1", arguments: "{}" }],
            },
          })
        : `${event({ choices: [{ delta: { tool_calls: [{ index: 0, id: "1", function: { name: "inspect", arguments: "{}" } }] } }] })}data: [DONE]\n\n`;
    const worker = adapter(provider, async (_, options) => {
      requests.push(JSON.parse(options.body));
      calls++;
      return calls === 1
        ? response(toolEvent)
        : calls === 2
          ? response("", false)
          : response(complete);
    });
    await worker.run({
      model: "test",
      input: "hi",
      tools: {
        inspect: {
          handler: async () => {
            toolCalls++;
            await new Promise((resolve) => setTimeout(resolve, 25));
            return "result";
          },
        },
      },
    });
    assert.equal(toolCalls, 1);
    assert.equal(calls, 3);
    assert.deepEqual(requests[1], requests[2]);
  });

  test(`${provider} cancellation stops a stalled request without retry`, async () => {
    let calls = 0;
    const controller = new AbortController();
    const worker = adapter(provider, async () => {
      calls++;
      return response("", false);
    });
    const pending = worker.run({ model: "test", input: "hi", signal: controller.signal });
    await new Promise((resolve) => setTimeout(resolve, 2));
    controller.abort(new Error("user cancelled"));
    await assert.rejects(pending, /user cancelled/);
    assert.equal(calls, 1);
  });

  test(`${provider} stops after the retry limit`, async () => {
    let calls = 0;
    const worker = adapter(
      provider,
      async () => {
        calls++;
        return response("", false);
      },
      { maxInactivityRetries: 1 },
    );
    await assert.rejects(worker.run({ model: "test", input: "hi" }), /response stalled/);
    assert.equal(calls, 2);
  });

  test(`${provider} accepts ongoing reasoning activity`, async () => {
    let calls = 0;
    const reasoning =
      provider === "OpenAI"
        ? event({ type: "response.reasoning_summary_text.delta", delta: "thinking" })
        : event({ choices: [{ delta: { reasoning: "thinking" } }] });
    const worker = adapter(
      provider,
      async () => {
        calls++;
        return new Response(
          new ReadableStream({
            start(controller) {
              let sent = 0;
              const interval = setInterval(() => {
                if (++sent === 4) {
                  clearInterval(interval);
                  controller.enqueue(encoder.encode(complete));
                  controller.close();
                } else controller.enqueue(encoder.encode(reasoning));
              }, 6);
            },
          }),
        );
      },
      { inactivityTimeoutMs: 20 },
    );
    await worker.run({ model: "test", input: "hi" });
    assert.equal(calls, 1);
  });
}

test("OpenAI retries a stalled WebSocket without HTTP fallback", async () => {
  let sockets = 0;
  let http = 0;
  const worker = adapter(
    "OpenAI",
    async () => {
      http++;
      throw new Error("unexpected HTTP");
    },
    {
      webSocketFactory: () => {
        const index = ++sockets;
        const socket = new EventEmitter();
        socket.send = (_, callback) => {
          callback();
          if (index > 1)
            queueMicrotask(() =>
              socket.emit(
                "message",
                Buffer.from(
                  JSON.stringify({
                    type: "response.completed",
                    response: { output: [{ type: "message" }] },
                  }),
                ),
              ),
            );
        };
        socket.terminate = () => {};
        socket.close = () => {};
        queueMicrotask(() => socket.emit("open"));
        return socket;
      },
    },
  );
  await worker.run({ model: "test", input: "hi", sessionID: "session" });
  assert.equal(sockets, 2);
  assert.equal(http, 0);
});

test("OpenAI WebSocket retry after a tool sends full history without rerunning the tool", async () => {
  let sockets = 0;
  let tools = 0;
  const requests = [];
  const worker = adapter("OpenAI", async () => assert.fail("unexpected HTTP"), {
    webSocketFactory: () => {
      const index = ++sockets;
      const socket = new EventEmitter();
      socket.send = (body, callback) => {
        callback();
        const request = JSON.parse(body);
        requests.push(request);
        const output =
          index === 1 && requests.length === 1
            ? {
                id: "previous",
                output: [{ type: "function_call", name: "inspect", call_id: "1", arguments: "{}" }],
              }
            : index === 2
              ? { output: [{ type: "message", content: [{ type: "output_text", text: "done" }] }] }
              : null;
        if (output)
          queueMicrotask(() =>
            socket.emit(
              "message",
              Buffer.from(JSON.stringify({ type: "response.completed", response: output })),
            ),
          );
      };
      socket.terminate = () => {};
      socket.close = () => {};
      queueMicrotask(() => socket.emit("open"));
      return socket;
    },
  });
  await worker.run({
    model: "test",
    input: "hi",
    sessionID: "session",
    tools: {
      inspect: {
        handler: async () => {
          tools++;
          return "result";
        },
      },
    },
  });
  assert.equal(tools, 1);
  assert.equal(requests[1].previous_response_id, "previous");
  assert.equal(requests[2].previous_response_id, undefined);
  assert.ok(
    requests[2].input.some(
      (item) => item.type === "function_call_output" && item.output === "result",
    ),
  );
});
