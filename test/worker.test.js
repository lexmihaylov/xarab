import test from "node:test";
import assert from "node:assert/strict";
import { createWorker } from "../src/agent/worker.js";

test("worker delegates execution to its provider adapter", async () => {
  const request = { model: "test-model", input: [{ role: "user", content: "hello" }] };
  const response = { handoff: { targetTier: 2 } };
  let received;
  const worker = createWorker({
    adapter: {
      run: async (nextRequest) => {
        received = nextRequest;
        return response;
      },
    },
  });

  assert.equal(await worker.run(request), response);
  assert.equal(received, request);
});

test("worker requires an adapter with a run method", () => {
  assert.throws(() => createWorker({ adapter: {} }), /run function is required/);
});
