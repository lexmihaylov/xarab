import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { ModelChooser } from "../src/ui/model-chooser.component.jsx";
import { StatusBar } from "../src/ui/status-bar.component.jsx";

async function render(element, options = { width: 120, height: 30 }) {
  const view = await testRender(element, options);
  await view.flush();
  return view;
}

test("model chooser applies the selected router and worker model", async () => {
  const classifiers = [];
  const workers = [];
  const view = await render(
    React.createElement(ModelChooser, {
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

test("model chooser deletes a selected router after confirmation", async () => {
  const deleted = [];
  const view = await render(
    React.createElement(ModelChooser, {
      models: ["/models/router.gguf"],
      modelSettings: {},
      classifierModel: null,
      openAIModels: [],
      tierWorkers: {},
      onClose() {},
      onSetClassifier() {},
      onSetTierWorker() {},
      onDeleteModel: (model) => deleted.push(model),
      onRefreshWorkerModels() {},
    }),
  );
  try {
    await act(async () => view.mockInput.pressArrow("down"));
    await view.flush();
    await act(async () => view.mockInput.pressKey("d"));
    await view.flush();
    assert.doesNotMatch(view.captureCharFrame(), /Delete router\.gguf\? Enter confirm/);
    await act(async () => view.mockInput.pressKey("d", { ctrl: true }));
    await view.flush();
    const confirmation = view.captureCharFrame();
    assert.match(confirmation, /DELETE LOCAL MODEL/);
    assert.match(confirmation, /Delete router\.gguf from local storage\? This cannot be undone\./);
    assert.match(confirmation, /Enter confirm · Esc cancel/);
    await act(async () => view.mockInput.pressEnter());
    assert.deepEqual(deleted, ["/models/router.gguf"]);
  } finally {
    await view.dispose();
  }
});

test("status bar prioritizes session persistence errors", async () => {
  const view = await render(
    React.createElement(StatusBar, {
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
