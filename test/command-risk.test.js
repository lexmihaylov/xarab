import test from "node:test";
import assert from "node:assert/strict";
import { authorizeCommand, parseCommandRisk } from "../src/agent/command-risk.js";
import { createShellTool } from "../src/agent/worker/tools/shell-tool.js";
import { createQuestionRequest } from "../src/agent/question-request.js";
import { createTaskIntegration } from "../src/agent/task-integration.js";

const assessment = (risk, scope = "workspace") => ({ risk, scope, reason: "Test assessment" });
test("workspace medium risk bypasses approval; other medium/high risks require it", async () => {
  for (const [risk, scope, requiresApproval] of [
    ["low", "workspace", false],
    ["medium", "workspace", false],
    ["medium", "outside", true],
    ["medium", "uncertain", true],
    ["high", "workspace", true],
    ["high", "outside", true],
  ]) {
    let asked = false;
    const result = await authorizeCommand({
      command: "echo test",
      workspace: "/work",
      assess: async () => assessment(risk, scope),
      requestQuestions: async (_, options) => {
        asked = true;
        assert.equal(options.commandApproval.command, "echo test");
        return {
          cancelled: false,
          answers: [{ id: "command_approval", choices: ["Approve"] }],
        };
      },
    });
    assert.equal(result.approved, true);
    assert.equal(asked, requiresApproval);
  }
});
test("invalid assessment offers unclassified dialog and returns denial feedback", async () => {
  const result = await authorizeCommand({
    command: "x",
    workspace: "/work",
    assess: async () => ({}),
    requestQuestions: async (_, options) => {
      assert.equal(options.commandApproval.risk, "unclassified");
      return {
        cancelled: false,
        answers: [{ id: "command_approval", choices: ["Deny"], text: "Stay inside the workspace" }],
      };
    },
  });
  assert.equal(result.approved, false);
  assert.match(result.reason, /Stay inside/);
  assert.throws(() => parseCommandRisk('{"risk":"low"}'));
});
test("cancellation and unavailable approval never authorize", async () => {
  const controller = new AbortController();
  controller.abort();
  assert.equal((await authorizeCommand({ signal: controller.signal })).approved, false);
  assert.equal(
    (
      await authorizeCommand({
        assess: async () => {
          throw Error();
        },
      })
    ).approved,
    false,
  );
  assert.equal(
    (
      await authorizeCommand({
        assess: async () => assessment("high"),
        requestQuestions: async () => ({ cancelled: true }),
      })
    ).approved,
    false,
  );
});
test("shell never starts denied commands", async () => {
  const events = [];
  const tool = createShellTool({
    assessCommand: async () => assessment("high"),
    onEvent: (e) => events.push(e),
    requestQuestions: async () => ({ cancelled: true }),
  });
  assert.match(await tool.handler({ command: "exit 99" }), /denied/);
  assert.deepEqual(events, []);
});

test("approval lifecycle queues dialogs and rejects stale answers and aborted approvals", async () => {
  const bridge = createQuestionRequest();
  const controller = new AbortController();
  const first = bridge.request([], {
    signal: controller.signal,
    commandApproval: { command: "first" },
  });
  const oldId = bridge.getState().requestId;
  const second = bridge.request([]);
  assert.equal(bridge.getState().requestId, oldId);
  controller.abort();
  assert.equal((await first).cancelled, true);
  const newId = bridge.getState().requestId;
  bridge.respond([], oldId);
  assert.equal(bridge.getState().requestId, newId);
  bridge.respond(null, newId);
  assert.equal((await second).cancelled, true);
});

test("validator failure offers approval; abort during approval overrides consent", async () => {
  const controller = new AbortController();
  const result = await authorizeCommand({
    command: "echo test",
    workspace: "/work",
    signal: controller.signal,
    assess: async () => {
      throw new Error("offline");
    },
    requestQuestions: async (_, { commandApproval }) => {
      assert.equal(commandApproval.risk, "unclassified");
      controller.abort();
      return { cancelled: false, answers: [{ id: "command_approval", choices: ["Approve once"] }] };
    },
  });
  assert.equal(result.approved, false);
});

test("risk assessment uses an isolated utility completion and strict parser", async () => {
  const calls = [];
  const tasks = createTaskIntegration({
    classify: async () => ({ valid: true, tier: 1 }),
    createWorker: ({ mode }) => ({
      getTierInfo: () => ({ configured: true }),
      async complete(request) {
        calls.push({ mode, request });
        request.onText(JSON.stringify(assessment("low")));
      },
    }),
  });
  try {
    const result = await tasks.assessCommand({ command: "npm test", workspace: "/work" });
    assert.equal(result.risk, "low");
    assert.equal(calls[0].mode, "validation");
    assert.match(calls[0].request.instructions, /untrusted data/);
    assert.match(calls[0].request.input[0].content, /npm test/);
  } finally {
    await tasks.shutdown();
  }
});
