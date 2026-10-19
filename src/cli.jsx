#!/usr/bin/env node

import React from "react";
import { render } from "ink";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { App } from "./ui/app.component.jsx";
import { createAssistantController } from "./agent/controller.js";
import { loadProjectInstructions } from "./agent/instructions.js";
import { acquireInstanceLock } from "./instance-lock.js";

const releaseInstanceLock = await acquireInstanceLock();
if (!releaseInstanceLock) {
  console.error("Another Xarab instance is already running for this user.");
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = process.cwd();
const dataDir = path.join(os.homedir(), ".xarab");
const modelsDir = path.resolve(
  process.env.XARAB_MODELS_DIR || path.join(os.homedir(), ".xarab", "models"),
);
const instructionFiles = await loadProjectInstructions(workspace);
let ui;
let controller;

function renderApp(state) {
  return (
    <App
      state={state}
      onSubmit={(value) => void controller.submit(value)}
      onEscape={controller.stopGeneration}
      onInterrupt={controller.handleInterrupt}
      onCloseModelModal={controller.closeModelModal}
      onDownloadSelectedModel={controller.downloadSelectedModel}
      onCancelModelDownload={controller.cancelModelDownload}
      onSearchHuggingFace={controller.searchHuggingFace}
      onDeleteModel={controller.deleteModel}
      onSetRouterClassifier={controller.setRouterClassifier}
      onSetRouterTierWorker={controller.setRouterTierWorker}
      onRefreshRouterWorkerModels={controller.refreshRouterWorkerModels}
      onApproveToolAction={controller.approveToolAction}
      onDenyToolAction={controller.denyToolAction}
      onOpenSessions={controller.openSessionPicker}
      onCloseSessions={controller.closeSessionPicker}
      onRestoreSession={controller.restoreSession}
      onNewSession={() => void controller.startNewSession()}
      onDeleteSession={controller.deleteSession}
      onRenameSession={controller.renameSession}
      onDraftChange={controller.updateDraft}
    />
  );
}

async function quit() {
  await controller.shutdown();
  ui?.unmount();
  if (controller.getState().sessionError) console.error(controller.getState().sessionError);
  void releaseInstanceLock().catch((error) =>
    console.error(`Could not release Xarab instance lock: ${error.message}`),
  );
}

controller = createAssistantController({
  root,
  modelsDir,
  configPath: path.join(dataDir, "config.json"),
  routingConfigPath: path.join(os.homedir(), ".xarab", "routing.conf"),
  sessionsDir: path.join(dataDir, "sessions"),
  workspace,
  instructionFiles,
  onQuit: quit,
  onStateChange(state) {
    ui?.rerender(renderApp(state));
  },
});

ui = render(renderApp(controller.getState()), {
  exitOnCtrlC: false,
  patchConsole: false,
  alternateScreen: true,
  incrementalRendering: true,
});

await controller.initialize();
