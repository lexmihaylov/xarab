import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { OpenTuiModelChooser } from "../src/ui/model-chooser.component.jsx";
import { OpenTuiStatusBar } from "../src/ui/status-bar.component.jsx";
import { OpenTuiToolApprovalDialog } from "../src/ui/tool-approval-dialog.component.jsx";

async function render(element, options = { width: 120, height: 30 }) {
  const view = await testRender(element, options);
  await view.flush();
  return view;
}

test("tool approval shows the request and lets users approve or deny it", async () => {
  const approved = [];
  const denied = [];
  const view = await render(
    React.createElement(OpenTuiToolApprovalDialog, {
      type: "websearch",
      command: "OpenTUI documentation",
      reasons: ["External network access is required."],
      onApprove: () => approved.push(true),
      onDeny: () => denied.push(true),
    }),
  );
  try {
    const frame = view.captureCharFrame();
    assert.match(frame, /WEB SEARCH APPROVAL/);
    assert.match(frame, /OpenTUI documentation/);
    assert.match(frame, /External network access is required/);
    await act(async () => view.mockInput.pressKey("y"));
    await act(async () => view.mockInput.pressKey("n"));
    assert.deepEqual(approved, [true]);
    assert.deepEqual(denied, [true]);
  } finally {
    await view.dispose();
  }
});

test("model chooser applies the selected router and worker model", async () => {
  const classifiers = [];
  const workers = [];
  const view = await render(
    React.createElement(OpenTuiModelChooser, {
      models: ["/models/router.gguf"],
      modelSettings: {},
      classifierModel: null,
      openAIModels: [{ id: "gpt-test", name: "Test worker" }],
      tierWorkers: {},
      onClose() {},
      onSetClassifier: (model) => classifiers.push(model),
      onSetTierWorker: (...args) => workers.push(args),
      onRefreshWorkerModels() {},
    }),
  );
  try {
    assert.match(view.captureCharFrame(), /ROUTING & MODEL ASSIGNMENTS/);
    await act(async () => view.mockInput.pressArrow("down"));
    await view.flush();
    await act(async () => view.mockInput.pressEnter());
    await view.flush();
    await act(async () => view.mockInput.pressEnter());
    await view.flush();
    await act(async () => view.mockInput.pressEnter());
    assert.deepEqual(classifiers, ["/models/router.gguf"]);
    assert.deepEqual(workers, [[1, { provider: "openai", model: "gpt-test" }]]);
  } finally {
    await view.dispose();
  }
});

test("status bar prioritizes session persistence errors", async () => {
  const view = await render(
    React.createElement(OpenTuiStatusBar, {
      status: "Ready",
      sessionTitle: "A saved conversation",
      sessionError: "Session save failed",
    }),
    { width: 80, height: 3 },
  );
  try {
    const frame = view.captureCharFrame();
    assert.match(frame, /Session save failed/);
    assert.doesNotMatch(frame, /A saved conversation|Ready/);
  } finally {
    await view.dispose();
  }
});
