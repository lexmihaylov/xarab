import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { testRender } from "@opentui/react/test-utils";
import { ShellMessage } from "../src/ui/shell-message.component.jsx";

async function render(message) {
  const view = await testRender(React.createElement(ShellMessage, { message }), {
    width: 100,
    height: 20,
  });
  await view.flush();
  return view;
}

test("renders a successful shell command separately from its output", async () => {
  const view = await render({
    type: "shell",
    command: "git status",
    message: "On branch main",
    severity: "info",
  });
  try {
    const frame = view.captureCharFrame();
    assert.match(frame, /Command injection/);
    assert.match(frame, /> git status/);
    assert.match(frame, /On branch main/);
    assert.doesNotMatch(frame, /Tool/);
  } finally {
    await view.dispose();
  }
});

test("renders warning and error shell statuses with their output", async (t) => {
  for (const severity of ["warning", "error"]) {
    await t.test(severity, async () => {
      const view = await render({
        type: "shell",
        command: "false",
        message: "command failed",
        severity,
      });
      try {
        const frame = view.captureCharFrame();
        assert.match(frame, /Command injection/);
        assert.match(frame, /> false/);
        assert.match(frame, /command failed/);
      } finally {
        await view.dispose();
      }
    });
  }
});
