import assert from "node:assert/strict";
import test from "node:test";
import { createSessionCompactor } from "../src/agent/session-compactor.js";

test("compaction transcript includes structured tool calls and results", async () => {
  const messages = [
    { type: "user", message: "Find the configuration value." },
    {
      type: "agent",
      message: "I found the relevant file.",
      parts: [
        {
          type: "tool",
          callId: "call-read-1",
          toolName: "read_file",
          params: { path: "config.json" },
          result: { ok: true, output: '{"mode":"safe"}' },
          status: "complete",
        },
        {
          type: "tool",
          callId: "task-1",
          toolName: "task",
          params: { brief: "review" },
          result: { ok: false, output: "Final task failure" },
          taskActivity: [{ label: "Secret child activity" }],
          status: "error",
        },
      ],
    },
  ];
  let workerRequest;
  let compactedMessages;
  const compactor = createSessionCompactor({
    getMessages: () => messages,
    setMessages: (next) => {
      compactedMessages = next;
    },
    setCurrentAgentMessage: () => {},
    addMessage: () => {},
    classifyForRouting: async () => ({
      classification: { tier: 1 },
      worker: { configured: true },
    }),
    worker: {
      async complete(request) {
        workerRequest = request;
        request.onTextDelta("Summary with the safe mode value.");
      },
    },
    sessionChanged: () => {},
    notify: () => {},
    updateStatus: () => {},
    isGenerating: () => false,
    isRouting: () => false,
    isSessionOperation: () => false,
    setGenerating: () => {},
    getAbortController: () => undefined,
    setAbortController: () => {},
  });

  await compactor.compact();

  const transcript = workerRequest.input[0].content;
  assert.match(transcript, /Tool call: read_file \(call-read-1\)/);
  assert.match(transcript, /Arguments: \{"path":"config.json"\}/);
  assert.match(transcript, /Result \(ok\):\n\{"mode":"safe"\}/);
  assert.match(transcript, /Result \(error\):\nFinal task failure/);
  assert.doesNotMatch(transcript, /Secret child activity/);
  assert.equal(compactedMessages.at(-1).message, "Summary with the safe mode value.");
});

test("manual compaction retries a timeout and discards the partial attempt", async () => {
  let messages = [{ type: "user", message: "Hello" }];
  let calls = 0;
  const statuses = [];
  const compactor = createSessionCompactor({
    getMessages: () => messages,
    setMessages: (next) => {
      messages = next;
    },
    setCurrentAgentMessage: () => {},
    addMessage: (message) => messages.push(message),
    classifyForRouting: async () => ({ classification: { tier: 1 }, worker: { configured: true } }),
    worker: {
      async complete(request) {
        if (++calls === 1) {
          request.onTextDelta("partial");
          throw Object.assign(new Error("stalled"), { code: "PROVIDER_INACTIVITY_TIMEOUT" });
        }
        request.onTextDelta("Complete summary");
      },
    },
    sessionChanged: () => {},
    notify: () => {},
    updateStatus: (status) => statuses.push(status),
    isGenerating: () => false,
    isRouting: () => false,
    isSessionOperation: () => false,
    setGenerating: () => {},
    getAbortController: () => undefined,
    setAbortController: () => {},
  });
  await compactor.compact();
  assert.equal(calls, 2);
  assert.equal(messages.at(-1).message, "Complete summary");
  assert.ok(statuses.some((status) => status.includes("retrying")));
});
