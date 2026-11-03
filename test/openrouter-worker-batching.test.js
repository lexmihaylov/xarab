import assert from "node:assert/strict";
import test from "node:test";
import { createOpenRouterWorkerAdapter } from "../src/agent/worker/openrouter-worker-adapter.js";
for (const rejects of [false, true]) {
  test(`cancellation during task batch propagates reason (handler rejects: ${rejects})`, async () => {
    const { adapter, requests } = fixture(["task", "task", "read_file"]);
    const controller = new AbortController();
    const started = deferred();
    const gate = deferred();
    const reason = new Error("cancelled by user");
    let count = 0;
    let nonTask = false;
    const run = adapter.run({
      model: "model",
      input: "go",
      signal: controller.signal,
      tools: {
        task: {
          handler: async (_, context) => {
            assert.equal(context.signal, controller.signal);
            if (++count === 2) started.resolve();
            await gate.promise;
            if (rejects) throw new Error("handler aborted");
            return "done";
          },
        },
        read_file: {
          handler: async () => {
            nonTask = true;
          },
        },
      },
    });
    await started.promise;
    controller.abort(reason);
    gate.resolve();
    await assert.rejects(run, (error) => error === reason);
    assert.equal(nonTask, false);
    assert.equal(requests.length, 1);
  });
}

test("task failures stay isolated and handoffs use call order", async () => {
  const { adapter, requests } = fixture(["task", "task", "task", "read_file"]);
  let nonTask = false;
  const result = await adapter.run({
    model: "model",
    input: "go",
    tools: {
      task: {
        handler: async ({ index }) => {
          if (index === 0) throw new Error("isolated failure");
          return { ok: true, output: "", handoff: { index } };
        },
      },
      read_file: {
        handler: async () => {
          nonTask = true;
        },
      },
    },
  });
  assert.deepEqual(result, { handoff: { index: 1 } });
  assert.equal(nonTask, false);
  assert.equal(requests.length, 1);
});

test("failed and unavailable calls preserve ordered error results", async () => {
  const { adapter, requests } = fixture(["task", "missing", "task"]);
  await adapter.run({
    model: "model",
    input: "go",
    tools: {
      task: {
        handler: async ({ index }) => {
          if (index === 0) throw new Error("failed");
          return { ok: false, output: "structured failure", errorCode: "TEST" };
        },
      },
    },
  });
  assert.deepEqual(
    requests[1].messages.filter((m) => m.role === "tool").map((m) => m.content),
    ["Error: failed", "Error: tool missing is unavailable.", "structured failure"],
  );
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(names) {
  const requests = [];
  const adapter = createOpenRouterWorkerAdapter({
    getApiKey: () => "key",
    fetchImpl: async (_, options) => {
      requests.push(JSON.parse(options.body));
      const delta =
        requests.length === 1
          ? {
              tool_calls: names
                .map((name, index) => ({
                  index,
                  id: String(index),
                  function: { name, arguments: JSON.stringify({ index }) },
                }))
                .reverse(),
            }
          : { content: "Done" };
      return new Response(`data: ${JSON.stringify({ choices: [{ delta }] })}\n\ndata: [DONE]\n\n`);
    },
  });
  return { adapter, requests };
}

test("batches only consecutive tasks, preserving start and result order across barriers", async () => {
  const { adapter, requests } = fixture(["task", "task", "read_file", "read_file", "task"]);
  const gates = Array.from({ length: 5 }, deferred);
  const started = Array.from({ length: 5 }, deferred);
  const starts = [];
  const handler = async ({ index }) => {
    starts.push(index);
    started[index].resolve();
    await gates[index].promise;
    return `result-${index}`;
  };
  const run = adapter.run({
    model: "model",
    input: "go",
    tools: {
      task: { handler },
      read_file: { handler },
    },
  });
  await started[1].promise;
  assert.deepEqual(starts, [0, 1]);
  gates[1].resolve();
  await Promise.resolve();
  assert.deepEqual(starts, [0, 1]);
  gates[0].resolve();
  await started[2].promise;
  assert.deepEqual(starts, [0, 1, 2]);
  gates[2].resolve();
  await started[3].promise;
  assert.deepEqual(starts, [0, 1, 2, 3]);
  gates[3].resolve();
  await started[4].promise;
  gates[4].resolve();
  await run;
  assert.deepEqual(
    requests[1].messages.filter((m) => m.role === "tool").map((m) => [m.tool_call_id, m.content]),
    [0, 1, 2, 3, 4].map((i) => [String(i), `result-${i}`]),
  );
});
