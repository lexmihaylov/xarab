import assert from "node:assert/strict";
import test from "node:test";
import { createAutoCompactor } from "../src/agent/auto-compactor.js";

function setup(initial) {
  let messages = initial;
  let requests = 0;
  const compactor = createAutoCompactor({
    getMessages: () => messages,
    setMessages: (next) => {
      messages = next;
    },
    classifyForRouting: async () => ({ classification: { tier: 1 }, worker: { configured: true } }),
    worker: {
      complete: async (request) => {
        requests++;
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
