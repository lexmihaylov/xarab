import test from "node:test";
import assert from "node:assert/strict";
import { createTaskRunner } from "../src/agent/task-runner.js";
import { createLocalWorkerRuntime } from "../src/agent/worker/local-worker-runtime.js";
import { createLocalLlamaWorkerAdapter } from "../src/agent/worker/local-llama-worker-adapter.js";

test("failed local context creation releases model allocations", async () => {
  let disposed = 0;
  const adapter = createLocalLlamaWorkerAdapter({
    modelRuntime: {
      async getLlama() {
        return {
          async loadModel() {
            return {
              async createContext() {
                throw new Error("No context memory");
              },
              async dispose() {
                disposed++;
              },
            };
          },
        };
      },
    },
  });
  await assert.rejects(adapter.run({ model: "model.gguf" }), /No context memory/);
  assert.equal(disposed, 1);
  await adapter.dispose();
});

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("shared local runtime reuses one adapter, queues utility work, and rejects nested local runs", async () => {
  let created = 0;
  let release;
  let disposed = 0;
  const runtime = createLocalWorkerRuntime(() => {
    created++;
    return {
      async run({ waitForRelease }) {
        if (waitForRelease)
          await new Promise((resolve) => {
            release = resolve;
          });
        return "done";
      },
      async dispose() {
        disposed++;
      },
    };
  });
  const main = runtime.createAdapter();
  const background = runtime.createAdapter({ wait: true });
  const pending = main.run({ waitForRelease: true });
  await assert.rejects(main.run({}), /busy/);
  const queued = background.run({});
  await tick();
  release();
  assert.equal(await pending, "done");
  assert.equal(await queued, "done");
  assert.equal(created, 1);
  await main.dispose();
  assert.equal(disposed, 0);
  await runtime.dispose();
  assert.equal(disposed, 1);
});

test("utility queue is bounded and timeout and shutdown propagate cancellation", async () => {
  const { runner } = setup({
    maxQueued: 1,
    timeoutMs: 15,
    complete: async ({ signal }) =>
      new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
  });
  // Keep the test event loop alive; task deadlines intentionally do not keep CLI alive.
  const keepAlive = setInterval(() => {}, 100);
  try {
    const first = runner.run({ brief: "Slow task" });
    await assert.rejects(runner.run({ brief: "Overflow" }), /queue is full/);
    assert.equal((await first).status, "timed-out");
    const second = runner.run({ brief: "Stop at shutdown" });
    await tick();
    await runner.shutdown();
    assert.equal((await second).status, "cancelled");
    await assert.rejects(runner.run({ brief: "Too late" }), /closed/);
  } finally {
    clearInterval(keepAlive);
  }
});

test("utility timeout captures pending task approval and preserves cleanup failure", async () => {
  const keepAlive = setInterval(() => {}, 100);
  try {
    const runner = createTaskRunner({
      timeoutMs: 15,
      classify: async () => ({ valid: true, tier: 2 }),
      createWorker: ({ onToolEvent }) => ({
        getTierInfo: () => ({ configured: true }),
        async complete({ signal }) {
          onToolEvent("run_command", { type: "invoked", callId: "1" });
          onToolEvent("approval", { type: "pending" });
          await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
          onToolEvent("approval", { type: "finished" });
        },
        async dispose() {
          throw new Error("secret cleanup details");
        },
      }),
    });
    const result = await runner.run({ brief: "review" });
    assert.equal(result.status, "timed-out");
    assert.equal(result.diagnostics.phase, "running");
    assert.equal(result.diagnostics.approvalPending, true);
    assert.deepEqual(result.diagnostics.lastTool, { name: "run_command", outcome: "running" });
    assert.equal(result.cleanupError, "Task resource cleanup failed.");
    assert.ok(result.diagnostics.elapsedMs >= 0);
  } finally {
    clearInterval(keepAlive);
  }
});

test("agentic tasks have no deadline and remain cancellable", async () => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const runner = createTaskRunner({
    timeoutMs: 10,
    classify: async () => ({ valid: true, tier: 2 }),
    createWorker: () => ({
      getTierInfo: () => ({ configured: true }),
      async run({ signal }) {
        started();
        await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
      },
    }),
  });
  const controller = new AbortController();
  const pending = runner.run({ mode: "agentic", brief: "review", signal: controller.signal });
  await ready;
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(controller.signal.aborted, false);
  controller.abort();
  const result = await pending;
  assert.equal(result.status, "cancelled");
  assert.equal(result.diagnostics.phase, "running");
});
test("cancellation records agentic classification phase", async () => {
  const keepAlive = setInterval(() => {}, 100);
  try {
    const runner = createTaskRunner({
      timeoutMs: 15,
      classify: ({ signal }) =>
        new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
      createWorker: () => {
        throw new Error("unexpected worker");
      },
    });
    const controller = new AbortController();
    const pending = runner.run({ mode: "agentic", brief: "review", signal: controller.signal });
    await tick();
    controller.abort();
    const result = await pending;
    assert.equal(result.status, "cancelled");
    assert.equal(result.diagnostics.phase, "classifying");
    assert.equal(result.diagnostics.approvalPending, false);
  } finally {
    clearInterval(keepAlive);
  }
});

function setup({
  classify = async () => ({ valid: true, tier: 2 }),
  complete,
  run,
  configured = true,
  ...limits
} = {}) {
  const calls = [];
  const runner = createTaskRunner({
    classify: async (request) => {
      calls.push(["classify", request]);
      return classify(request);
    },
    createWorker: () => ({
      getTierInfo: () => ({ configured }),
      complete:
        complete ??
        (async (request) => {
          calls.push(["complete", request]);
          request.onTextDelta('{"ok":true}');
        }),
      run:
        run ??
        (async (request) => {
          calls.push(["run", request]);
          request.onTextDelta("Summary");
        }),
      async dispose() {
        calls.push(["dispose"]);
      },
    }),
    ...limits,
  });
  return { runner, calls };
}

test("utility task routes a bounded brief, has no history/tools, and validates structured output", async () => {
  const { runner, calls } = setup();
  const result = await runner.run({
    brief: "Generate metadata",
    input: "private selected context",
    instructions: "Return JSON",
    parse: JSON.parse,
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(result.value, { ok: true });
  assert.equal(
    calls.some(([name]) => name === "classify"),
    false,
  );
  assert.equal(calls[0][0], "complete");
  assert.equal(calls[0][1].tools, undefined);
  assert.equal(calls[0][1].tier, 1);
  await runner.shutdown();
});

test("agentic mode uses clean context, selected MCPs, and only one active task", async () => {
  let release;
  const { runner, calls } = setup({
    run: async (request) => {
      calls.push(["run", request]);
      await new Promise((resolve) => {
        release = resolve;
      });
      request.onTextDelta("Done");
    },
  });
  const first = runner.run({
    mode: "agentic",
    brief: "Investigate",
    input: "selected",
    instructions: "Profile",
    mcpServers: ["docs"],
  });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(runner.run({ mode: "agentic", brief: "Second" }), /already running/);
  release();
  assert.equal((await first).status, "completed");
  const classification = calls.find(([name]) => name === "classify")[1];
  assert.deepEqual(classification.recentMessages, []);
  assert.doesNotMatch(classification.prompt, /selected/);
  const request = calls.find(([name]) => name === "run")[1];
  assert.equal(request.tier, 2);
  assert.deepEqual(request.history, []);
  assert.deepEqual(request.mcpServers, ["docs"]);
  assert.equal(request.taskInstructions, "Profile");
  await runner.shutdown();
});

test("classification errors, unconfigured tiers, and malformed results fail without fallback", async () => {
  const invalidClassification = setup({ classify: async () => null });
  const agentic = await invalidClassification.runner.run({ mode: "agentic", brief: "Task" });
  assert.equal(agentic.status, "failed");
  assert.match(agentic.error, /classification failed/i);
  await invalidClassification.runner.shutdown();

  for (const options of [
    { configured: false },
    { complete: async ({ onTextDelta }) => onTextDelta("not json") },
  ]) {
    const { runner } = setup(options);
    const result = await runner.run({ brief: "Task", parse: JSON.parse });
    assert.equal(result.status, "failed");
    assert.ok(result.error);
    await runner.shutdown();
  }
});

test("output overflow is bounded and cancellation reaches active execution", async () => {
  const overflow = setup({ complete: async ({ onTextDelta }) => onTextDelta("x".repeat(17000)) });
  const result = await overflow.runner.run({ brief: "Task" });
  assert.equal(result.status, "failed");
  assert.match(result.error, /exceeds/);
  assert.equal(result.partial, "");
  const controller = new AbortController();
  const { runner } = setup({
    complete: async ({ signal }) =>
      new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true })),
  });
  const pending = runner.run({ brief: "Task", signal: controller.signal });
  await new Promise((resolve) => setImmediate(resolve));
  controller.abort(new Error("Parent stopped"));
  assert.match((await pending).error, /Parent stopped/);
  await runner.shutdown();
});
