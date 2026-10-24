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
  assert.equal(controller.getState().classifier, null);
  assert.equal(controller.getState().messages.length, 0);

  await controller.submit("/help");
  assert.match(controller.getState().messages.at(-1).message, /\/route/);
  assert.match(controller.getState().messages.at(-1).message, /\/connect/);
  assert.match(controller.getState().messages.at(-1).message, /\/exit/);
  assert.doesNotMatch(controller.getState().messages.at(-1).message, /\/quit/);
  assert.ok(states.length > 0);

  await controller.submit("/connect");
  assert.equal(controller.getState().providerModal.statuses.openai, "Not connected");
  assert.equal(controller.getState().providerModal.statuses.openrouter, "No API key saved");
  await controller.providerAction("openrouter", "complete", "test-secret-key");
  assert.equal(
    controller.getState().providerModal.statuses.openrouter,
    "API key saved · verify by refreshing models in /route",
  );
  assert.doesNotMatch(JSON.stringify(controller.getState()), /test-secret-key/);
  assert.equal(
    JSON.parse(await readFile(path.join(temporary, "config.json"), "utf8")).apiKeys.openrouter,
    "test-secret-key",
  );
  await controller.providerAction("openrouter", "disconnect");
  assert.equal(controller.getState().providerModal.statuses.openrouter, "No API key saved");
  await controller.providerAction("openai", "connect");
  assert.match(copiedAuthorizationUrl, /^https:\/\/auth\.openai\.com\/oauth\/authorize\?/);
  assert.equal(controller.getState().providerModal.pending.copied, true);
  await controller.providerAction("openai", "copy");
  controller.closeProviderModal();
  assert.equal(controller.getState().providerModal, null);

  await controller.submit("/route");
  assert.equal(controller.getState().modelModal.mode, "chooser");
  controller.closeModelModal();
  await controller.submit("/download");
  assert.equal(controller.getState().modelModal.mode, "download");

  await controller.submit("/exit");
  assert.equal(quitRequested, true);
  await controller.shutdown();
});

test("manual shell commands persist command, output, and severity", async (t) => {
  const temporary = await mkdtemp("/tmp/opencode/xarab-shell-test-");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const controller = createAssistantController({
    root: temporary,
    workspace: temporary,
    instructionFiles: [],
    configPath: path.join(temporary, "config.json"),
  });
  await controller.initialize();

  await controller.submit("!printf success-output");
  const success = controller.getState().messages.at(-1);
  assert.deepEqual(
    {
      type: success.type,
      command: success.command,
      severity: success.severity,
    },
    { type: "shell", command: "printf success-output", severity: "info" },
  );
  assert.match(success.message, /success-output/);

  await controller.submit("!false");
  const warning = controller.getState().messages.at(-1);
  assert.equal(warning.type, "shell");
  assert.equal(warning.command, "false");
  assert.equal(warning.severity, "warning");

  await controller.submit("!command-that-does-not-exist-xarab");
  const failure = controller.getState().messages.at(-1);
  assert.equal(failure.type, "shell");
  assert.equal(failure.command, "command-that-does-not-exist-xarab");
  assert.equal(failure.severity, "warning");

  await controller.shutdown();
});

test("publishes a running shell message before command completion", async (t) => {
  const temporary = await mkdtemp("/tmp/opencode/xarab-shell-running-test-");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const controller = createAssistantController({
    root: temporary,
    workspace: temporary,
    instructionFiles: [],
    configPath: path.join(temporary, "config.json"),
  });
  await controller.initialize();

  const pending = controller.submit("!sleep 0.1");
  const running = controller.getState();
  assert.equal(running.commandRunning, true);
  assert.equal(running.messages.at(-1).type, "shell");
  assert.equal(running.messages.at(-1).command, "sleep 0.1");
  assert.equal(running.messages.at(-1).message, "");
  assert.equal(running.messages.at(-1).running, true);

  await pending;
  const completed = controller.getState();
  assert.equal(completed.commandRunning, false);
  assert.equal(completed.messages.at(-1).running, undefined);
  assert.match(completed.messages.at(-1).message, /exit code 0/);
  await controller.shutdown();
});

test("selecting a classifier loads it and persists classifier configuration", async (t) => {
  const temporary = await mkdtemp("/tmp/opencode/xarab-model-test-");
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const loadedModels = [];
  const controller = createAssistantController({
    root: temporary,
    workspace: temporary,
    instructionFiles: [],
    configPath: path.join(temporary, "config.json"),
    classifierFactory({ getAssignment }) {
      return {
        async load() {
          loadedModels.push(getAssignment().model);
        },
        async dispose() {},
      };
    },
  });
  await controller.initialize();
  await controller.setRouterClassifier(path.join(temporary, "router.gguf"));

  assert.deepEqual(loadedModels, [path.join(temporary, "router.gguf")]);
  assert.deepEqual(controller.getState().classifier, {
    provider: "local",
    model: path.join(temporary, "router.gguf"),
  });
  assert.equal(controller.getState().modelModal, null);
  const routingConfig = JSON.parse(await readFile(path.join(temporary, "routing.conf"), "utf8"));
  assert.deepEqual(routingConfig.classifier, {
    provider: "local",
    model: path.join(temporary, "router.gguf"),
  });
  await controller.shutdown();
});
