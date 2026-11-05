import assert from "node:assert/strict";
import test from "node:test";
import { createAutoCompactor } from "../src/agent/auto-compactor.js";

function setup(initial, complete) {
  let messages = initial;
  let requests = 0;
  let lastRequest;
  const compactor = createAutoCompactor({
    getMessages: () => messages,
    setMessages: (next) => {
      messages = next;
    },
    classifyForRouting: async () => ({ classification: { tier: 1 }, worker: { configured: true } }),
    worker: {
      complete: async (request) => {
        requests++;
        lastRequest = request;
        if (complete) return complete(request, requests);
        request.onTextDelta(`Summary ${requests}`);
      },
    },
    addMessage: (message) => messages.push(message),
    sessionChanged: () => {},
    notify: () => {},
    updateStatus: () => {},
    setGenerating: () => {},
    getAbortController: () => undefined,
    setAbortController: () => {},
    isShuttingDown: () => false,
  });
  return {
    compactor,
    get messages() {
      return messages;
    },
    get requests() {
      return requests;
    },
    get lastRequest() {
      return lastRequest;
    },
  };
}

function turn(index) {
  return [
    { type: "user", message: `User ${index}` },
    {
      type: "agent",
      message: `Reply ${index}`,
      parts: [{ type: "tool", toolName: "read_file", result: { output: `Result ${index}` } }],
    },
  ];
}

test("auto-compacts at 50 user turns, retaining ten complete turns", async () => {
  const state = setup(Array.from({ length: 49 }, (_, i) => turn(i)).flat());
  assert.equal(await state.compactor.compact(), false);
  state.messages.push(...turn(49));
  assert.equal(await state.compactor.compact(), true);
  assert.equal(state.messages.length, 21);
  assert.equal(state.messages[0].autoCompactSummary, true);
  assert.equal(state.messages[1].message, "User 40");
  assert.equal(state.messages.at(-1).parts[0].result.output, "Result 49");
  assert.equal(await state.compactor.compact(), false);
  for (let i = 50; i < 100; i++) state.messages.push(...turn(i));
  assert.equal(await state.compactor.compact(), true);
  assert.equal(state.messages[1].message, "User 90");
  assert.equal(state.requests, 2);
});
test("auto-compaction retries timed-out summaries without keeping partial output", async () => {
  let stale;
  const state = setup(
    Array.from({ length: 50 }, (_, i) => turn(i)).flat(),
    async (request, count) => {
      if (count === 1) {
        request.onTextDelta("partial");
        stale = request.onTextDelta;
        throw Object.assign(new Error("stalled"), { code: "PROVIDER_INACTIVITY_TIMEOUT" });
      }
      stale("late");
      request.onTextDelta("Recovered summary");
    },
  );
  assert.equal(await state.compactor.compact(), true);
  assert.equal(state.requests, 2);
  assert.equal(state.messages[0].message, "Recovered summary");
});

test("auto-compaction preserves history when all retries time out", async () => {
  const original = Array.from({ length: 50 }, (_, i) => turn(i)).flat();
  const state = setup(original, async () => {
    throw Object.assign(new Error("stalled"), { code: "PROVIDER_INACTIVITY_TIMEOUT" });
  });
  assert.equal(await state.compactor.compact(), false);
  assert.equal(state.requests, 3);
  assert.equal(state.messages[0].message, "User 0");
  assert.equal(state.messages.at(-1).type, "system");
});
test("auto-compaction includes task final responses but not child activity", async () => {
  const messages = Array.from({ length: 50 }, (_, i) => turn(i)).flat();
  messages[1].parts.push({
    type: "tool",
    toolName: "task",
    params: { brief: "review" },
    result: { ok: true, output: "Final task findings" },
    taskActivity: [{ label: "Secret child activity" }],
  });
  const state = setup(messages);
  assert.equal(await state.compactor.compact(), true);
  const transcript = state.lastRequest.input[0].content;
  assert.match(transcript, /Result \(ok\): Final task findings/);
  assert.doesNotMatch(transcript, /Secret child activity/);
});
