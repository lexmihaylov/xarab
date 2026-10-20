import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { OpenTuiSessionBrowser } from "../src/ui/session-browser.component.jsx";

const sessions = [
  {
    id: "one",
    title: "First saved chat",
    workspace: "/workspace",
    updatedAt: "2026-03-24T12:00:00.000Z",
    messageCount: 2,
    preview: [{ type: "user", message: "Hello" }],
  },
  {
    id: "two",
    title: "Second saved chat",
    workspace: "/workspace",
    updatedAt: "2026-03-24T13:00:00.000Z",
    messageCount: 3,
    preview: [{ type: "agent", message: "Hi there" }],
  },
];

async function renderBrowser(props = {}) {
  const view = await testRender(
    React.createElement(OpenTuiSessionBrowser, {
      sessions,
      onClose() {},
      onSelect() {},
      onNew() {},
      onDelete() {},
      onRename() {},
      ...props,
    }),
    { width: 120, height: 30 },
  );
  await view.flush();
  return view;
}

test("session browser filters sessions and restores the selected session", async () => {
  const selected = [];
  const view = await renderBrowser({ onSelect: (id) => selected.push(id) });
  try {
    assert.match(view.captureCharFrame(), /First saved chat/);
    await act(async () => view.mockInput.pressTab({ shift: true }));
    await act(async () => view.mockInput.typeText("Second"));
    await view.flush();
    assert.match(view.captureCharFrame(), /SESSIONS · 1/);
    assert.match(view.captureCharFrame(), /Second saved chat/);
    await act(async () => view.mockInput.pressEnter());
    assert.deepEqual(selected, ["two"]);
  } finally {
    await view.dispose();
  }
});

test("session browser requires confirmation before deleting a session", async () => {
  const deleted = [];
  const view = await renderBrowser({ onDelete: (id) => deleted.push(id) });
  try {
    await act(async () => view.mockInput.pressKey("d", { ctrl: true }));
    await view.flush();
    assert.match(view.captureCharFrame(), /DELETE First saved chat\?/);
    assert.deepEqual(deleted, []);
    await act(async () => view.mockInput.pressEnter());
    assert.deepEqual(deleted, ["one"]);
  } finally {
    await view.dispose();
  }
});
