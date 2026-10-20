#!/usr/bin/env node

import React, { useEffect, useState } from "react";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createCliRenderer, RGBA, SyntaxStyle } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createAssistantController } from "./agent/controller.js";
import { loadProjectInstructions } from "./agent/instructions.js";
import { acquireInstanceLock } from "./instance-lock.js";
import { OpenTuiApp } from "./ui/app.component.jsx";

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
const renderer = await createCliRenderer({ screenMode: "alternate-screen", useMouse: true });
const syntaxStyle = SyntaxStyle.fromStyles(
  {
    keyword: { fg: RGBA.fromHex("#c792ea") },
    string: { fg: RGBA.fromHex("#c3e88d") },
    comment: { fg: RGBA.fromHex("#657383"), italic: true },
    number: { fg: RGBA.fromHex("#f78c6c") },
    type: { fg: RGBA.fromHex("#82aaff") },
    function: { fg: RGBA.fromHex("#82aaff") },
    default: { fg: RGBA.fromHex("#c5d0dd") },
  },
  renderer.nativeScene,
);
const ui = createRoot(renderer);
let controller;
let updateAppState;
let shuttingDown = false;

function OpenTuiRoot({ initialState }) {
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
    <OpenTuiApp
      state={state}
      syntaxStyle={syntaxStyle}
      onSubmit={(value) => void controller.submit(value)}
      onStopGeneration={controller.stopGeneration}
      onInterrupt={controller.handleInterrupt}
      onDraftChange={controller.updateDraft}
      onCloseModelModal={controller.closeModelModal}
      onDownloadSelectedModel={controller.downloadSelectedModel}
      onCancelModelDownload={controller.cancelModelDownload}
      onSearchHuggingFace={controller.searchHuggingFace}
      onSetRouterClassifier={controller.setRouterClassifier}
      onSetRouterTierWorker={controller.setRouterTierWorker}
      onDeleteModel={controller.deleteModel}
      onRefreshRouterWorkerModels={controller.refreshRouterWorkerModels}
      onApproveToolAction={controller.approveToolAction}
      onDenyToolAction={controller.denyToolAction}
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
  if (controller.getState().sessionError) console.error(controller.getState().sessionError);
  await releaseInstanceLock().catch((error) =>
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
    updateAppState?.(state);
  },
});

ui.render(<OpenTuiRoot initialState={controller.getState()} />);
await controller.initialize();
