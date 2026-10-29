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
      configStore: {
        ...createConfig(),
        getTierWorker: (tier) => ({ provider: "local", model: `tier-${tier}.gguf` }),
      },
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
    assert.match(request.instructions, /Your active tier is 1/);
    assert.match(request.instructions, /Do not wait for repeated failures/);
    assert.match(request.instructions, /Avoid handoffs for tiny amounts of work/);
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

test("worker hides adjustment without a routed tier, callback, or distinct model", async () => {
  for (const mode of ["default", "no-callback", "same-model"]) {
    let request;
    const adapter = {
      run: async (value) => {
        request = value;
      },
    };
    const worker = createWorker({
      configStore: createConfig({ provider: "local", model: "same.gguf" }),
      openAIAdapterFactory: () => adapter,
      localAdapterFactory: () => adapter,
    });
    await worker.run({
      tier: mode === "default" ? undefined : 1,
      input: "hello",
      onTierAdjustment: mode === "no-callback" ? undefined : async () => ({}),
    });
    assert.equal(request.tools.tier_adjustment, undefined);
    assert.doesNotMatch(request.instructions, /## Tier adjustment/);
    await worker.dispose();
  }
});

test("worker dispatches OpenRouter assignments to its adapter", async () => {
  let selected;
  const worker = createWorker({
    configStore: createConfig({ provider: "openrouter", model: "vendor/worker" }),
    openAIAdapterFactory: () => {
      throw new Error("wrong adapter");
    },
    localAdapterFactory: () => {
      throw new Error("wrong adapter");
    },
    openRouterAdapterFactory: () => ({
      run: async (request) => {
        selected = request;
      },
    }),
  });
  await worker.run({ tier: 2, input: "hello" });
  assert.equal(selected.model, "vendor/worker");
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

test("worker history keeps complete tool exchanges without an aggregate byte cap", () => {
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
    ["call-1", "call-2", "call-3", "call-4", "call-5"],
  );
  assert.deepEqual(
    results.map((result) => result.callId),
    calls.map((call) => call.callId),
  );
  assert.deepEqual(
    results.map((result) => result.output.slice(0, 8)),
    ["result-1", "result-2", "result-3", "result-4", "result-5"],
  );
  assert.ok(!history.some((item) => item.callId === "interrupted-call"));
});

test("worker history replays editing results and diff previews without arguments", () => {
  const names = ["edit", "insert_before", "insert_after", "write"];
  const parts = names.map((toolName, index) => ({
    type: "tool",
    callId: `edit-${index}`,
    toolName,
    params: { path: "file.js", content: "large-secret-argument".repeat(1000) },
    result: { ok: true, output: `Changed file.js (${toolName}).` },
    diffText: "--- file.js\n+++ file.js\n-old\n+new",
    diffNotice: index === 0 ? "Preview shortened; only part of the change is shown." : "",
  }));
  const original = structuredClone(parts);
  const history = buildWorkerHistory([
    { type: "user", message: "Change the file" },
    { type: "agent", parts },
  ]);
  assert.equal(history.length, 5);
  for (const [index, item] of history.slice(1).entries()) {
    assert.equal(item.role, "assistant");
    assert.match(item.content, new RegExp(`Historical ${names[index]} tool result`));
    assert.match(item.content, /Status: success/);
    assert.match(item.content, /\+new/);
    assert.doesNotMatch(item.content, /large-secret-argument/);
  }
  assert.match(history[1].content, /Preview shortened/);
  assert.deepEqual(parts, original);
});

test("editing history preserves failures and supports older or interrupted sessions", () => {
  const history = buildWorkerHistory([
    {
      type: "agent",
      parts: [
        { type: "text", text: "Before" },
        {
          type: "tool",
          callId: "failed",
          toolName: "edit",
          params: { oldString: "private" },
          result: { ok: false, output: "Error: no match" },
        },
        {
          type: "tool",
          callId: "legacy",
          toolName: "write",
          result: { ok: true, output: "Wrote file.js" },
        },
        { type: "tool", callId: "interrupted", toolName: "edit", status: "running" },
        { type: "text", text: "After" },
      ],
    },
  ]);
  assert.equal(history.length, 4);
  assert.equal(history[0].content, "Before");
  assert.match(history[1].content, /Status: error\nError: no match/);
  assert.match(history[2].content, /Wrote file\.js/);
  assert.doesNotMatch(history[2].content, /Diff preview/);
  assert.equal(history[3].content, "After");
  assert.doesNotMatch(JSON.stringify(history), /private|interrupted/);
});

test("editing diff previews are not subject to an aggregate replay cap", () => {
  const history = buildWorkerHistory([
    {
      type: "agent",
      parts: [
        {
          type: "tool",
          callId: "large",
          toolName: "write",
          result: { ok: true, output: "Wrote file" },
          diffText: "x".repeat(64 * 1024),
        },
        {
          type: "tool",
          callId: "recent",
          toolName: "read_file",
          params: {},
          result: { ok: true, output: "recent" },
        },
      ],
    },
  ]);
  assert.equal(history.length, 3);
  assert.match(history[0].content, /Historical write tool result/);
  assert.equal(history[1].callId, "recent");
  assert.equal(history[2].callId, "recent");
});

test("worker history retains tool activity from the last ten user turns", () => {
  const messages = [{ type: "agent", message: "Earlier summary", parts: [] }];
  for (let index = 0; index < 12; index += 1) {
    messages.push(
      { type: "user", message: `User ${index}` },
      {
        type: "agent",
        parts: [
          { type: "text", text: `Assistant ${index}` },
          {
            type: "tool",
            callId: `call-${index}`,
            toolName: "read_file",
            params: {},
            result: { ok: true, output: `Result ${index}` },
          },
        ],
      },
    );
  }
  const snapshot = structuredClone(messages);
  const history = buildWorkerHistory(messages, "Current request");
  assert.equal(history[0].content, "Earlier summary");
  assert.ok(history.some((item) => item.content === "User 0"));
  assert.ok(history.some((item) => item.content === "Assistant 0"));
  assert.deepEqual(
    history.filter((item) => item.type === "tool_call").map((item) => item.callId),
    Array.from({ length: 10 }, (_, index) => `call-${index + 2}`),
  );
  assert.deepEqual(
    history.filter((item) => item.type === "tool_result").map((item) => item.callId),
    history.filter((item) => item.type === "tool_call").map((item) => item.callId),
  );
  assert.equal(history.at(-1).content, "Current request");
  assert.deepEqual(messages, snapshot);
});

test("worker rejects an unconfigured tier", async () => {
  const worker = createWorker({
    configStore: createConfig(undefined),
    openAIAdapterFactory: () => ({ run: async () => {} }),
    localAdapterFactory: () => ({ run: async () => {} }),
  });

  await assert.rejects(() => worker.run({ tier: 2 }), /Tier 2 is not configured/);
});
