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
  assert.equal(calls.length, 1);
  assert.equal(calls[0].model, "local.gguf");
  assert.deepEqual(calls[0].input, [{ role: "user", content: "hello" }]);
  assert.equal(typeof calls[0].tools.read_file.handler, "function");
});

test("worker uses the OpenAI adapter for the default worker", async () => {
  test("worker provides tier adjustment as an internal worker tool", async () => {
    let request;
    const worker = createWorker({
      configStore: createConfig({ provider: "local", model: "local.gguf" }),
      openAIAdapterFactory: () => ({ run: async () => {} }),
      localAdapterFactory: () => ({
        run: async (value) => {
          request = value;
          return {};
        },
      }),
    });

    await worker.run({
      tier: 1,
      input: "hello",
      onTierAdjustment: async () => ({ status: "unchanged" }),
    });
    assert.equal(typeof request.tools.tier_adjustment.handler, "function");
    assert.match(request.instructions, /Tier adjustment/);
  });
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

test("worker disposes an inactive adapter before selecting another assignment", async () => {
  let assignment = { provider: "local", model: "first.gguf" };
  const disposed = [];
  const worker = createWorker({
    configStore: {
      getTierWorker: () => assignment,
      getOpenAIModel: () => undefined,
    },
    openAIAdapterFactory: () => ({
      run: async () => {},
      dispose: async () => disposed.push("openai"),
    }),
    localAdapterFactory: () => ({
      run: async () => {},
      dispose: async () => disposed.push("local"),
    }),
  });

  await worker.run({ tier: 1, input: "first" });
  assignment = { provider: "openai", model: "second" };
  await worker.run({ tier: 1, input: "second" });

  assert.deepEqual(disposed, ["local"]);
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

test("worker history keeps newest complete tool exchanges within the replay limit", () => {
  const output = (label) => `${label}${"x".repeat(16 * 1024 - label.length)}`;
  const parts = Array.from({ length: 5 }, (_, index) => ({
    type: "tool",
    callId: `call-${index + 1}`,
    toolName: "read_file",
    params: { path: `file-${index + 1}.txt` },
    result: { ok: true, output: output(`result-${index + 1}`) },
  }));
  parts.splice(1, 0, {
    type: "tool",
    callId: "interrupted-call",
    toolName: "run_command",
    params: { command: "long-running-command" },
    status: "error",
  });

  const history = buildWorkerHistory([{ type: "agent", parts }]);
  const calls = history.filter((item) => item.type === "tool_call");
  const results = history.filter((item) => item.type === "tool_result");

  assert.deepEqual(
    calls.map((call) => call.callId),
    ["call-2", "call-3", "call-4", "call-5"],
  );
  assert.deepEqual(
    results.map((result) => result.callId),
    calls.map((call) => call.callId),
  );
  assert.deepEqual(
    results.map((result) => result.output.slice(0, 8)),
    ["result-2", "result-3", "result-4", "result-5"],
  );
  assert.ok(!history.some((item) => item.callId === "interrupted-call"));
});

test("worker rejects an unconfigured tier", async () => {
  const worker = createWorker({
    configStore: createConfig(undefined),
    openAIAdapterFactory: () => ({ run: async () => {} }),
    localAdapterFactory: () => ({ run: async () => {} }),
  });

  await assert.rejects(() => worker.run({ tier: 2 }), /Tier 2 is not configured/);
});
