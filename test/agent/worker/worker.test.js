import test from "node:test";
import assert from "node:assert/strict";
import { createWorker } from "../../../src/agent/worker/worker.js";

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
  assert.deepEqual(calls, [{ input: "hello", model: "local.gguf" }]);
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

test("worker rejects an unconfigured tier", async () => {
  const worker = createWorker({
    configStore: createConfig(undefined),
    openAIAdapterFactory: () => ({ run: async () => {} }),
    localAdapterFactory: () => ({ run: async () => {} }),
  });

  await assert.rejects(() => worker.run({ tier: 2 }), /Tier 2 is not configured/);
});
