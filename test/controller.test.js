import test from "node:test";
import assert from "node:assert/strict";
import { createAssistantController } from "../src/agent/controller.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";

test("controller owns command handling and publishes updated UI state", async (t) => {
  const temporary = await mkdtemp("/tmp/opencode/xarab-controller-");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const states = [];
  let quitRequested = false;
  let copiedAuthorizationUrl;
  const controller = createAssistantController({
    root: process.cwd(),
    workspace: process.cwd(),
    instructionFiles: [],
    configPath: path.join(temporary, "config.json"),
    clipboardWriter: async (url) => {
      copiedAuthorizationUrl = url;
      return true;
    },
    onStateChange: (state) => states.push(state),
    onQuit: () => {
      quitRequested = true;
    },
  });

  await controller.initialize();
  assert.equal(controller.getState().model, undefined);
  assert.equal(controller.getState().classifierModel, null);
  assert.equal(controller.getState().messages.length, 0);

  await controller.submit("/help");
  assert.match(controller.getState().messages.at(-1).message, /\/route/);
  assert.match(controller.getState().messages.at(-1).message, /\/openai login/);
  assert.ok(states.length > 0);

  await controller.submit("/openai status");
  assert.match(controller.getState().messages.at(-1).message, /not connected/);
  await controller.submit("/openai login");
  const loginMessage = controller.getState().messages.at(-1);
  assert.match(loginMessage.message, /copied to your clipboard/);
  assert.doesNotMatch(loginMessage.message, /code_challenge=/);
  assert.match(copiedAuthorizationUrl, /^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
  await controller.submit("/openai copy");
  assert.match(copiedAuthorizationUrl, /^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
  assert.match(controller.getState().messages.at(-1).message, /copied/);
  await controller.submit("/openai use gpt-test-model");
  assert.match(controller.getState().messages.at(-1).message, /gpt-test-model/);
  assert.equal(
    JSON.parse(await readFile(path.join(temporary, "config.json"), "utf8")).openaiModel,
    "gpt-test-model",
  );

  await controller.submit("/route");
  assert.equal(controller.getState().modelModal.mode, "chooser");
  controller.closeModelModal();
  await controller.submit("/model /path/to/model.gguf");
  assert.match(controller.getState().messages.at(-1).message, /Use \/route/);
  assert.equal(controller.getState().model, undefined);
  await controller.submit("/download");
  assert.equal(controller.getState().modelModal.mode, "download");

  await controller.submit("/quit");
  assert.equal(quitRequested, true);
  await controller.shutdown();
});

test("selecting a classifier loads it and persists classifier configuration", async (t) => {
  const temporary = await mkdtemp("/tmp/opencode/xarab-router-model-test-");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const loadedModels = [];
  const controller = createAssistantController({
    root: temporary,
    workspace: temporary,
    instructionFiles: [],
    configPath: path.join(temporary, "config.json"),
    tierClassifierFactory({ modelPath }) {
      return {
        async load() {
          loadedModels.push(modelPath);
        },
        async dispose() {},
      };
    },
  });
  await controller.initialize();
  await controller.setRouterClassifier(path.join(temporary, "router.gguf"));

  assert.deepEqual(loadedModels, [path.join(temporary, "router.gguf")]);
  assert.equal(controller.getState().classifierModel, path.join(temporary, "router.gguf"));
  assert.equal(controller.getState().modelModal, null);
  const routingConfig = JSON.parse(await readFile(path.join(temporary, "routing.conf"), "utf8"));
  assert.equal(routingConfig.classifierModel, path.join(temporary, "router.gguf"));
  await controller.shutdown();
});
