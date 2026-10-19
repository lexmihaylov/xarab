import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createAssistantController } from "../src/agent/controller.js";
import { createSessionStore, newSession } from "../src/agent/session-store.js";
import { buildChatRows } from "../src/ui/chat-layout.js";

async function setup(t, behavior = async ({ onText }) => onText("Reply")) {
  const root = await mkdtemp("/tmp/opencode/xarab-session-controller-");
  const controllers = [];
  t.after(async () => {
    for (const controller of controllers) await controller.shutdown();
    await rm(root, { recursive: true, force: true });
  });
  const create = async () => {
    const controller = createAssistantController({
      root,
      workspace: root,
      modelsDir: path.join(root, "models"),
      configPath: path.join(root, "config.json"),
      instructionFiles: [],
      tierClassifierFactory: () => ({
        async classify() {
          return { valid: true, tier: 1, rationale: "test" };
        },
        async dispose() {},
      }),
      openAIAdapterFactory: () => ({
        async run(options) {
          await behavior(options);
        },
        async listModels() {
          return [];
        },
      }),
    });
    controllers.push(controller);
    await controller.initialize();
    return controller;
  };
  const configure = async (controller) => {
    await controller.setRouterClassifier(path.join(root, "classifier.gguf"));
    await controller.setRouterTierWorker(1, { provider: "openai", model: "test-model" });
  };
  return {
    root,
    create,
    configure,
    store: createSessionStore(path.join(root, "sessions")),
  };
}

test("routes chat through the local classifier to an OpenAI worker and autosaves it", async (t) => {
  const { root, create, configure, store } = await setup(t);
  const controller = await create();
  await configure(controller);
  await controller.submit("Explain this project");

  const record = await store.load(controller.getState().currentSession.id);
  assert.equal(record.title, "Explain this project");
  assert.equal(record.messages.at(-1).message, "Reply");
  assert.equal(record.modelPath, undefined);
  assert.equal(record.contextSize, undefined);
  assert.deepEqual(record.history, []);
  assert.equal((await store.list(root)).sessions.length, 1);
  assert.equal(controller.getState().classifierModel, path.join(root, "classifier.gguf"));
});

test("does not use a local model as a fallback when routing is disabled", async (t) => {
  const { create } = await setup(t);
  const controller = await create();
  await controller.submit("Answer this");
  assert.match(controller.getState().messages.at(-1).message, /Configure a local classifier/);
  assert.equal(
    controller.getState().messages.some((message) => message.type === "agent"),
    false,
  );
});

test("starts a new session when routing is not configured", async (t) => {
  const { create } = await setup(t);
  const controller = await create();
  await controller.startNewSession();

  assert.equal(controller.getState().sessionError, null);
  assert.match(controller.getState().status, /Use \/route/);
});

test("restores saved messages and drafts without loading a saved local worker", async (t) => {
  const { root, create, configure, store } = await setup(t);
  const controller = await create();
  await configure(controller);
  await controller.submit("Remember this task");
  await controller.saveSession("Remembered");
  const id = controller.getState().currentSession.id;
  controller.updateDraft({ value: "Unsent question", cursor: 6 });
  await controller.startNewSession();
  await controller.submit("Another task");
  await controller.restoreSession(id);

  assert.equal(controller.getState().currentSession.title, "Remembered");
  assert.deepEqual(controller.getState().sessionDraft, { value: "Unsent question", cursor: 6 });
  assert.ok(
    controller.getState().messages.some((message) => message.message === "Remember this task"),
  );
  assert.equal((await store.load(id)).workspace, path.resolve(root));
});

test("keeps OpenAI streamed text and tool activity in event order in one assistant message", async (t) => {
  const { create } = await setup(t, async ({ onText, tools }) => {
    onText("Before tool. ");
    await tools.list_files.handler({ path: "." });
    onText("After tool.");
  });
  const controller = await create();
  await controller.submit("/openai use test-model");
  await controller.submit("/openai ask Inspect the workspace");

  const assistant = controller.getState().messages.filter((message) => message.type === "agent");
  assert.equal(assistant.length, 1);
  assert.deepEqual(
    assistant[0].parts.map((part) => (part.type === "text" ? part.text : part.toolName)),
    ["Before tool. ", "list_files", "After tool."],
  );
  const rendered = buildChatRows(controller.getState().messages, 80).map((line) => line.text);
  const before = rendered.findIndex((line) => line.includes("Before tool."));
  const tool = rendered.findIndex((line) => line.includes("Listing ."));
  const after = rendered.findIndex((line) => line.includes("After tool."));
  assert.ok(before >= 0 && before < tool && tool < after);
});

test("legacy local-model metadata is ignored when restoring a session", async (t) => {
  const { root, create, configure, store } = await setup(t);
  const controller = await create();
  await configure(controller);
  await controller.submit("Existing conversation");
  const record = await store.load(controller.getState().currentSession.id);
  record.modelPath = path.join(root, "removed-model.gguf");
  record.contextSize = 32768;
  await store.save(record);

  await controller.startNewSession();
  await controller.restoreSession(record.id);
  assert.ok(
    controller.getState().messages.some((message) => message.message === "Existing conversation"),
  );
  assert.equal(controller.getState().status, "Session restored");
});

test("session save errors and foreign-workspace restores do not replace the active session", async (t) => {
  const { root, create, store } = await setup(t);
  const controller = await create();
  controller.updateDraft({ value: "Keep this draft", cursor: 5 });
  const current = controller.getState().currentSession.id;
  const other = newSession(path.join(root, "other"));
  await store.save(other);
  await controller.restoreSession(other.id);
  assert.equal(controller.getState().currentSession.id, current);
  assert.match(controller.getState().sessionError, /another workspace/);
  assert.equal(controller.getState().sessionDraft.value, "Keep this draft");
});
