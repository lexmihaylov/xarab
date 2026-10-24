#!/usr/bin/env node

import React, { useEffect, useState } from "react";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createAssistantController } from "./agent/controller.js";
import { loadProjectInstructions } from "./agent/worker/instructions.js";
import { acquireInstanceLock } from "./instance-lock.js";
import { createMarkdownStyle } from "./utils/markdown-style.js";
import { createDiagnosticLog } from "./utils/diagnostic-log.js";
import { App } from "./App.component.jsx";

const diagnostics = createDiagnosticLog(path.join(os.homedir(), ".xarab", "xarab.log"));
process.on("warning", (warning) => {
  void diagnostics.append("warning", `${warning.name}: ${warning.message}`);
});

const releaseInstanceLock = await acquireInstanceLock();
if (!releaseInstanceLock) {
  await diagnostics.append("error", "Another Xarab instance is already running for this user.");
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
const renderer = await createCliRenderer({ screenMode: "alternate-screen", useMouse: true });
const syntaxStyle = createMarkdownStyle(renderer.nativeScene);
const ui = createRoot(renderer);
let controller;
let updateAppState;
let shuttingDown = false;

function Root({ initialState }) {
  const [state, setState] = useState(initialState);

  useEffect(() => {
    updateAppState = setState;
    return () => {
      updateAppState = undefined;
    };
  }, []);

  return renderApp(state);
}

function renderApp(state) {
  return (
    <App
      state={state}
      syntaxStyle={syntaxStyle}
      onSubmit={(value) => void controller.submit(value)}
      onStopGeneration={controller.stopGeneration}
      onInterrupt={controller.handleInterrupt}
      onDraftChange={controller.updateDraft}
      onCloseModelModal={controller.closeModelModal}
      onOpenProviders={controller.openProviderModal}
      onCloseProviders={controller.closeProviderModal}
      onProviderAction={controller.providerAction}
      onDownloadSelectedModel={controller.downloadSelectedModel}
      onCancelModelDownload={controller.cancelModelDownload}
      onSearchHuggingFace={controller.searchHuggingFace}
      onSetRouterClassifier={controller.setRouterClassifier}
      onSetRouterTierWorker={controller.setRouterTierWorker}
      onDeleteModel={controller.deleteModel}
      onRefreshRouterWorkerModels={controller.refreshRouterWorkerModels}
      onOpenSessions={controller.openSessionPicker}
      onCloseSessions={controller.closeSessionPicker}
      onRestoreSession={controller.restoreSession}
      onNewSession={controller.startNewSession}
      onDeleteSession={controller.deleteSession}
      onRenameSession={controller.renameSession}
    />
  );
}

async function quit() {
  if (shuttingDown) return;
  shuttingDown = true;
  await controller.shutdown();
  ui.unmount();
  renderer.destroy();
  syntaxStyle.destroy();
  if (controller.getState().sessionError) {
    await diagnostics.append(
      "error",
      "Session shutdown reported an error (details displayed on stderr).",
    );
    console.error(controller.getState().sessionError);
  }
  await releaseInstanceLock().catch(async (error) => {
    await diagnostics.append("error", `Could not release Xarab instance lock: ${error.message}`);
    console.error(`Could not release Xarab instance lock: ${error.message}`);
  });
  await diagnostics.flush();
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
    updateAppState?.(state);
  },
});

ui.render(<Root initialState={controller.getState()} />);
await controller.initialize();
