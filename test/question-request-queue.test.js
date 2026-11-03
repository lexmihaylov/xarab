import test from "node:test";
import assert from "node:assert/strict";
import { createQuestionRequest } from "../src/agent/question-request.js";

test("questions queue independently and cancellation preserves the active dialog", async () => {
  const service = createQuestionRequest();
  const controller = new AbortController();
  const first = service.request(["first"]);
  const firstId = service.getState().requestId;
  const second = service.request(["second"], { signal: controller.signal });
  const third = service.request(["third"]);
  controller.abort();
  assert.equal((await second).cancelled, true);
  assert.equal(service.getState().requestId, firstId);
  service.respond(["answer"], firstId);
  assert.deepEqual((await first).answers, ["answer"]);
  assert.deepEqual(service.getState().questions, ["third"]);
  service.respond(["stale"], firstId);
  assert.deepEqual(service.getState().questions, ["third"]);
  service.respond(null);
  assert.equal((await third).cancelled, true);
  assert.equal(service.getState(), undefined);
});
