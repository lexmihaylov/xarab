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

  let assignment;
  await worker.run({ tier: 1, input: "hello", onAssignment: (value) => (assignment = value) });
  assert.deepEqual(assignment, { tier: 1, provider: "local", model: "local.gguf" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].onAssignment, undefined);
  assert.equal(calls[0].model, "local.gguf");
  assert.deepEqual(calls[0].input, [{ role: "user", content: "hello" }]);
  assert.equal(typeof calls[0].tools.read_file.handler, "function");
});

test("assignment reports the execution-time selection and survives adapter startup failure", async () => {
  let model = "first";
  const worker = createWorker({
    configStore: { getTierWorker: () => ({ provider: "local", model }) },
    openAIAdapterFactory: () => ({ run: async () => {} }),
    localAdapterFactory: () => {
      throw new Error("adapter failed");
    },
  });
  assert.equal(worker.getTierInfo(2).model, "first");
  model = "second";
  let assignment;
  await assert.rejects(
    worker.complete({ tier: 2, onAssignment: (value) => (assignment = value) }),
    /adapter failed/,
  );
  assert.deepEqual(assignment, { tier: 2, provider: "local", model: "second" });
  await worker.dispose();
});

test("main and agentic preparation preserve shared tools and isolate profile instructions", async () => {
  const calls = [];
  const worker = createWorker({
    configStore: createConfig({ provider: "local", model: "local.gguf" }),
    openAIAdapterFactory: () => ({ run: async () => {} }),
    localAdapterFactory: () => ({
      run: async (request) => {
        calls.push(request);
      },
    }),
  });
  try {
    await worker.run({ tier: 1, input: "main" });
    await worker.run({
      tier: 1,
      input: "child",
      history: [],
      taskInstructions: "Profile marker",
      mcpServers: [],
    });
    assert.doesNotMatch(calls[0].instructions, /Subtask response discipline/);
    assert.match(calls[0].instructions, /## Research-first workflow/);
    assert.doesNotMatch(calls[0].instructions, /You are Xarab's delegated agent/);
    assert.match(calls[1].instructions, /You are Xarab's delegated agent/);
    assert.doesNotMatch(calls[1].instructions, /## Research-first workflow/);
    assert.match(calls[1].instructions, /consequential workspace changes or other side effects/);
    assert.match(calls[1].instructions, /## Subtask response discipline/);
    assert.match(
      calls[1].instructions,
      /shortest final response that preserves what the parent needs/,
    );
    assert.match(
      calls[1].instructions,
      /Agent profile \(subordinate to application policy and user constraints\):\nProfile marker/,
    );
    assert.equal(typeof calls[0].tools.read_file.handler, "function");
    assert.equal(typeof calls[1].tools.read_file.handler, "function");
    assert.deepEqual(calls[1].input, [{ role: "user", content: "child" }]);
  } finally {
    await worker.dispose();
  }
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
    {
      type: "tool_result",
      callId: "call_1",
      ok: true,
      output: 'Status: success\n{"name":"xarab"}',
    },
    { role: "assistant", content: "The package is named xarab." },
    { role: "user", content: "What is its name?" },
  ]);
});

test("worker history replays completed tool calls as text without an aggregate byte cap", () => {
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
    calls.map((call) => call.arguments.path),
    ["file-1.txt", "file-2.txt", "file-3.txt", "file-4.txt", "file-5.txt"],
  );
  assert.deepEqual(
    results.map((result) => result.output.match(/result-\d/)?.[0]),
    ["result-1", "result-2", "result-3", "result-4", "result-5"],
  );
  assert.ok(!history.some((item) => item.callId === "interrupted-call"));
});

test("worker history replays tool calls as text with bounded arguments and edit diff previews", () => {
  const names = ["edit", "insert_before", "insert_after", "write"];
  const parts = names.map((toolName, index) => {
    const params =
      toolName === "edit"
        ? {
            path: "file.js",
            oldString: "large-secret-old-argument".repeat(1000),
            newString: "large-secret-new-argument".repeat(1000),
          }
        : toolName === "write"
          ? { path: "file.js", content: "large-secret-argument".repeat(1000) }
          : {
              path: "file.js",
              anchor: "unique-anchor",
              content: "large-secret-argument".repeat(1000),
            };
    return {
      type: "tool",
      callId: `edit-${index}`,
      toolName,
      params,
      result: { ok: true, output: `Changed file.js (${toolName}).` },
      diffText: "--- file.js\n+++ file.js\n-old\n+new",
      diffNotice: index === 0 ? "Preview shortened; only part of the change is shown." : "",
    };
  });
  const original = structuredClone(parts);
  const history = buildWorkerHistory([
    { type: "user", message: "Change the file" },
    { type: "agent", parts },
  ]);
  assert.equal(history.length, 9);
  for (const [index, name] of names.entries()) {
    const call = history[index * 2 + 1];
    const result = history[index * 2 + 2];
    assert.equal(call.type, "tool_call");
    assert.equal(call.name, name);
    assert.equal(result.type, "tool_result");
    assert.equal(result.callId, call.callId);
    assert.match(
      result.output,
      /Historical edit arguments are excerpts capped at 200 characters per value/,
    );
    assert.match(result.output, /Status: success/);
    assert.match(result.output, /\+new/);
    assert.ok(result.output.length < 1_000);
    if (name === "edit") {
      assert.equal(call.arguments.path, "file.js");
      assert.equal(call.arguments.oldString.length, 200);
      assert.equal(call.arguments.newString.length, 200);
    }
  }
  assert.match(history[2].output, /Preview shortened/);
  assert.deepEqual(parts, original);
});

test("worker history preserves non-edit tool arguments", () => {
  const query = "specific search query ".repeat(10);
  const history = buildWorkerHistory([
    {
      type: "agent",
      parts: [
        {
          type: "tool",
          callId: "search-1",
          toolName: "websearch",
          params: { query },
          result: { ok: true, output: "Found results" },
        },
      ],
    },
  ]);

  assert.equal(history[0].type, "tool_call");
  assert.equal(history[0].arguments.query, query);
  assert.equal(history[1].type, "tool_result");
  assert.doesNotMatch(history[1].output, /Historical edit arguments are excerpts/);
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
          params: {
            path: "a/very/long/path/filename.js",
            oldString: "private",
            newString: "public",
          },
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
  assert.equal(history.length, 6);
  assert.equal(history[0].content, "Before");
  assert.deepEqual(history[1], {
    type: "tool_call",
    callId: "failed",
    name: "edit",
    arguments: { path: "a/very/long/path/filename.js", oldString: "private", newString: "public" },
  });
  assert.match(history[2].output, /Status: error[\s\S]*Error: no match/);
  assert.equal(history[3].name, "write");
  assert.match(history[4].output, /Wrote file\.js/);
  assert.doesNotMatch(history[4].output, /Diff preview/);
  assert.equal(history[5].content, "After");
  assert.doesNotMatch(JSON.stringify(history), /interrupted/);
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
  assert.equal(history.length, 4);
  assert.equal(history[0].name, "write");
  assert.equal(history[1].type, "tool_result");
  assert.equal(history[2].name, "read_file");
  assert.equal(history[3].type, "tool_result");
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
  assert.equal(history.filter((item) => item.type === "tool_call").length, 10);
  assert.deepEqual(
    history
      .filter((item) => item.type === "tool_result")
      .map((item) => item.output.match(/Result (\d+)/)?.[1]),
    Array.from({ length: 10 }, (_, index) => String(index + 2)),
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
