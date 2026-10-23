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
  assert.equal(compactedMessages.at(-1).message, "Summary with the safe mode value.");
});
