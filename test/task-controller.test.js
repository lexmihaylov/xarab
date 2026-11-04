import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createAssistantController } from "../src/agent/controller.js";
import { createSessionStore } from "../src/agent/session-store.js";
import { createToolTimelineObserver } from "../src/agent/worker/tool-timeline-observer.js";

async function setup(t, run, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "xarab-task-controller-"));
  const states = [];
  const controller = createAssistantController({
    root,
    workspace: root,
    instructionFiles: [],
    configPath: path.join(root, "config.json"),
    classifierFactory: () => ({
      async classify() {
        return { valid: true, tier: 1 };
      },
      async dispose() {},
    }),
    openAIAdapterFactory: () => ({ run }),
    onStateChange: (state) => states.push(state),
    ...options,
  });
  t.after(async () => {
    await controller.shutdown();
    await rm(root, { recursive: true, force: true });
  });
  await controller.initialize();
  await controller.setRouterClassifier(path.join(root, "classifier.gguf"));
  await controller.setRouterTierWorker(1, { provider: "openai", model: "test" });
  return { controller, states, root };
}

test("parent task tool runs an isolated child, streams progress, and returns summary without recursion", async (t) => {
  let childRequest;
  const { controller, states } = await setup(
    t,
    async (request) => {
      if (request.tools?.task) {
        const result = await request.tools.task.handler(
          { brief: "Investigate separately", context: "Selected facts" },
          { callId: "child-call", signal: request.signal },
        );
        assert.equal(result.ok, true);
        assert.equal(result.output, "Child summary");
        request.onTextDelta("Parent answer");
      } else {
        childRequest = request;
        assert.ok(request.tools.run_command);
        assert.equal(request.tools.task, undefined);
        await request.tools.list_files.handler(
          { path: "." },
          { callId: "list-child", signal: request.signal },
        );
        request.onTextDelta("Child summary");
      }
    },
    { automaticTitles: false, automaticSuggestions: false },
  );
  await controller.submit("Parent secret context must not be inherited");
  assert.doesNotMatch(JSON.stringify(childRequest.input), /Parent secret/);
  assert.match(JSON.stringify(childRequest.input), /Selected facts/);
  assert.ok(
    states.some((state) =>
      state.messages.some((message) =>
        message.parts?.some((part) => part.toolName === "task" && part.summary === "Child summary"),
      ),
    ),
  );
  const message = controller.getState().messages.find((message) => message.type === "agent");
  assert.equal(message.message, "Parent answer");
  const task = message.parts.find((part) => part.toolName === "task");
  assert.equal(task.result.output, "Child summary");
  assert.equal(task.taskAgent, "general-purpose");
  assert.equal(task.taskExecution, "Tier 1 · openai · test");
  assert.deepEqual(task.taskActivity, [
    { callId: "list-child", label: "Listing .", status: "complete" },
  ]);
  assert.ok(
    states.some((state) =>
      state.messages.some((item) =>
        item.parts?.some(
          (part) =>
            part.toolName === "task" &&
            part.status === "running" &&
            part.taskExecution === task.taskExecution,
        ),
      ),
    ),
  );
});

test("suggestions use the last answer and are cleared by draft edits", async (t) => {
  let utilityInput;
  const { controller } = await setup(
    t,
    async (request) => {
      if (request.tools?.task) request.onTextDelta("The completed answer");
      else {
        utilityInput = request.input;
        request.onTextDelta("Please explain more");
      }
    },
    { automaticTitles: false },
  );
  await controller.submit("Question");
  for (let i = 0; i < 100 && !controller.getState().suggestion; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.match(JSON.stringify(utilityInput), /The completed answer/);
  assert.equal(controller.getState().suggestion, "Please explain more");
  controller.updateDraft({ value: "My draft", cursor: 8 });
  assert.equal(controller.getState().suggestion, null);
});

test("suggestions are user-voiced and a draft edit clears subscribers immediately", async (t) => {
  const states = [];
  let suggestionRequest;
  const { controller } = await setup(
    t,
    async (request) => {
      if (request.tools?.task) request.onTextDelta("Answer details");
      else {
        suggestionRequest = request;
        request.onTextDelta("Could you clarify the trade-offs?");
      }
    },
    { automaticTitles: false, onStateChange: (state) => states.push(state) },
  );
  await controller.submit("Question");
  for (let i = 0; i < 100 && !controller.getState().suggestion; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(controller.getState().suggestion, "Could you clarify the trade-offs?");
  assert.match(JSON.stringify(suggestionRequest.input), /shortest useful next message/);
  assert.match(JSON.stringify(suggestionRequest.input), /direct and confident/);
  assert.match(JSON.stringify(suggestionRequest.input), /never answer as the agent/);
  assert.match(suggestionRequest.instructions, /shortest useful message/);
  assert.match(suggestionRequest.instructions, /preferably under 80 characters/);
  assert.match(suggestionRequest.instructions, /direct, confident message/);
  assert.match(suggestionRequest.instructions, /never answer as the agent/);
  controller.updateDraft({ value: "Draft", cursor: 5 });
  assert.equal(states.at(-1).suggestion, null);
});

test("stopping the parent cancels its active child and returns an explicit cancellation", async (t) => {
  let started;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  let childResult;
  const { controller } = await setup(
    t,
    async (request) => {
      if (request.tools?.task) {
        childResult = await request.tools.task.handler(
          { brief: "Long task" },
          { signal: request.signal },
        );
      } else {
        started();
        await new Promise((resolve) =>
          request.signal.addEventListener("abort", resolve, { once: true }),
        );
      }
    },
    { automaticTitles: false },
  );
  const pending = controller.submit("Delegate this task");
  await ready;
  controller.stopGeneration();
  await pending;
  assert.equal(childResult.ok, false);
  assert.match(childResult.output, /cancelled/);
  assert.equal(controller.getState().generating, false);
});

test("terminal task cards settle unfinished child activity without changing completed outcomes", () => {
  const observer = createToolTimelineObserver({ sessionChanged() {}, notify() {} });
  for (const outcome of ["success", "failure", "cancelled"]) {
    const part = {
      toolName: "task",
      status: "running",
      taskActivity: [{ status: "running" }, { status: "complete" }, { status: "error" }],
    };
    if (outcome === "cancelled") observer.fail(part, { ok: false, output: "cancelled" });
    else observer.complete(part, "task", {}, { ok: outcome === "success", output: outcome });
    assert.deepEqual(
      part.taskActivity.map((item) => item.status),
      ["unknown", "complete", "error"],
    );
  }
});
test("default background titles persist without adding their output to the parent answer", async (t) => {
  const { controller, root } = await setup(t, async (request) => {
    request.onTextDelta(request.tools?.task ? "Main response" : "Generated title");
  });
  await controller.submit("Original first message");
  for (
    let count = 0;
    count < 30 && controller.getState().currentSession.title !== "Generated title";
    count++
  )
    await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(controller.getState().currentSession.title, "Generated title");
  await controller.shutdown();
  const saved = await createSessionStore(path.join(root, "sessions")).load(
    controller.getState().currentSession.id,
  );
  assert.equal(saved.title, "Generated title");
  assert.equal(saved.manualTitle, false);
  assert.equal(
    saved.messages
      .filter((message) => message.type === "agent")
      .map((message) => message.message)
      .join(""),
    "Main response",
  );
});
