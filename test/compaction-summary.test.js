import assert from "node:assert/strict";
import test from "node:test";
import { generateCompactionSummary } from "../src/agent/compaction-summary.js";

const timeout = () => Object.assign(new Error("stalled"), { code: "PROVIDER_INACTIVITY_TIMEOUT" });

test("compaction retries are bounded and non-timeout errors are not retried", async () => {
  for (const [error, expected] of [
    [timeout(), 3],
    [new Error("bad request"), 1],
  ]) {
    let calls = 0;
    await assert.rejects(
      generateCompactionSummary({
        worker: {
          complete: async () => {
            calls++;
            throw error;
          },
        },
        request: {},
        signal: new AbortController().signal,
      }),
      error,
    );
    assert.equal(calls, expected);
  }
});

test("compaction cancellation prevents a retry and rejects a late success", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(
    generateCompactionSummary({
      worker: {
        complete: async ({ onTextDelta }) => {
          calls++;
          controller.abort(new Error("cancelled"));
          onTextDelta("late");
          throw timeout();
        },
      },
      request: {},
      signal: controller.signal,
    }),
    /cancelled|stalled/,
  );
  assert.equal(calls, 1);
});
