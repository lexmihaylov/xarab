import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { ProviderConnections } from "../src/components/ProviderConnections.component.jsx";
import { ModelChooser } from "../src/components/ModelChooser.component.jsx";
import { StatusBar } from "../src/components/StatusBar.component.jsx";

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
      models: [
        { provider: "local", id: "/models/router.gguf", name: "router.gguf" },
        { provider: "openai", id: "gpt-test", name: "Test worker" },
      ],
      modelSettings: {},
      classifierModel: null,
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
    assert.deepEqual(classifiers, [{ provider: "local", model: "/models/router.gguf" }]);
    assert.deepEqual(workers, [[1, { provider: "local", model: "/models/router.gguf" }]]);
  } finally {
    await view.dispose();
  }
});

test("model chooser deletes a selected router after confirmation", async () => {
  const deleted = [];
  const view = await render(
    React.createElement(ModelChooser, {
      models: [{ provider: "local", id: "/models/router.gguf", name: "router.gguf" }],
      modelSettings: {},
      classifierModel: null,
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

test("provider dialog starts sign-in and offers redirect input", async () => {
  const actions = [];
  const props = {
    providers: [{ id: "openai", name: "OpenAI" }],
    statuses: { openai: "Not connected" },
    onClose() {},
    onAction: (...args) => actions.push(args),
  };
  const view = await render(React.createElement(ProviderConnections, props));
  try {
    assert.match(view.captureCharFrame(), /PROVIDER CONNECTIONS/);
    await act(async () => view.mockInput.pressEnter());
    assert.deepEqual(actions, [["openai", "connect"]]);
    const pendingView = await render(
      React.createElement(ProviderConnections, {
        ...props,
        pending: { id: "openai", url: "https://example.com/login", copied: true },
      }),
    );
    try {
      assert.match(pendingView.captureCharFrame(), /Paste redirect URL/);
      assert.match(pendingView.captureCharFrame(), /Sign-in URL copied/);
    } finally {
      await pendingView.dispose();
    }
  } finally {
    await view.dispose();
  }
});

test("OpenRouter panel directs users to refresh routing models", async () => {
  const view = await render(
    React.createElement(ProviderConnections, {
      providers: [{ id: "openrouter", name: "OpenRouter", method: "apiKey" }],
      statuses: { openrouter: "No API key saved" },
      onClose() {},
      onAction() {},
    }),
  );
  try {
    assert.match(view.captureCharFrame(), /Refresh \/route to verify model access/);
    assert.match(view.captureCharFrame(), /Key entry is visible/);
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
