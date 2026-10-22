import test from "node:test";
import assert from "node:assert/strict";
import { buildWorkerHistory, createWorker } from "../../../src/agent/worker/worker.js";

function createConfig(tierWorker) {
  return {
    getTierWorker: () => tierWorker,
    getOpenAIModel: () => "default-openai",
  };
}

test("worker selects an adapter and passes the configured model", async () => {
  const calls = [];
  const adapter = { run: async (request) => (calls.push(request), { ok: true }) };
  const worker = createWorker({
    configStore: createConfig({ provider: "local", model: "local.gguf" }),
    openAIAdapterFactory: () => {
      throw new Error("wrong adapter");
    },
    localAdapterFactory: () => adapter,
  });

  await worker.run({ tier: 1, input: "hello" });
  assert.deepEqual(calls, [{ input: [{ role: "user", content: "hello" }], model: "local.gguf" }]);
});

test("worker uses the OpenAI adapter for the default worker", async () => {
  let selected;
  const worker = createWorker({
    configStore: createConfig(),
    openAIAdapterFactory: () => ({ run: async (request) => (selected = request) }),
    localAdapterFactory: () => {
      throw new Error("wrong adapter");
    },
  });

  await worker.run({ input: "hello" });
  assert.equal(selected.model, "default-openai");
});

test("worker history preserves completed tool calls and their results", () => {
  const history = buildWorkerHistory(
    [
      { type: "user", message: "Read the package manifest." },
      {
        type: "agent",
        parts: [
          { type: "text", text: "I will inspect it." },
          {
            type: "tool",
            callId: "call_1",
            toolName: "read_file",
            params: { path: "package.json" },
            result: { ok: true, output: '{"name":"xarab"}' },
          },
          { type: "text", text: "The package is named xarab." },
        ],
      },
    ],
    "What is its name?",
  );

  assert.deepEqual(history, [
    { role: "user", content: "Read the package manifest." },
    { role: "assistant", content: "I will inspect it." },
    {
      type: "tool_call",
      callId: "call_1",
      name: "read_file",
      arguments: { path: "package.json" },
    },
    { type: "tool_result", callId: "call_1", output: '{"name":"xarab"}', ok: true },
    { role: "assistant", content: "The package is named xarab." },
    { role: "user", content: "What is its name?" },
  ]);
});

test("worker rejects an unconfigured tier", async () => {
  const worker = createWorker({
    configStore: createConfig(undefined),
    openAIAdapterFactory: () => ({ run: async () => {} }),
    localAdapterFactory: () => ({ run: async () => {} }),
  });

  await assert.rejects(() => worker.run({ tier: 2 }), /Tier 2 is not configured/);
});
