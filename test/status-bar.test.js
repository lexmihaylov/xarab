import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { testRender } from "@opentui/react/test-utils";
import { StatusBar } from "../src/components/StatusBar.component.jsx";

async function frame(props, width) {
  const view = await testRender(React.createElement(StatusBar, props), { width, height: 3 });
  try {
    await view.flush();
    return view.captureCharFrame().split("\n")[0];
  } finally {
    await view.dispose();
  }
}

test("status bar shows title and status left, workspace right", async () => {
  const line = await frame(
    { sessionTitle: "Conversation", status: "Ready", workspace: "/home/project" },
    60,
  );
  assert.match(line, /^ Conversation  ·  Ready\s+\/home\/project\s*$/);
  assert.doesNotMatch(line, /Session:/);
});

test("status bar fits narrow widths and retains status", async () => {
  const line = await frame(
    { sessionTitle: "A very long title", status: "Ready", workspace: "/a/very/long/workspace" },
    24,
  );
  assert.match(line, /Ready/);
  assert.match(line, /\/a\//);
  assert.doesNotMatch(line, /Session:/);
  const tiny = await frame({ sessionTitle: "Title", status: "Ready", workspace: "/workspace" }, 7);
  assert.match(tiny, /Ready/);
});

test("notice takes precedence over error and normal details", async () => {
  const line = await frame(
    {
      notice: "Notice",
      sessionError: "Error",
      sessionTitle: "Title",
      status: "Ready",
      workspace: "/workspace",
    },
    60,
  );
  assert.match(line, /Notice/);
  assert.doesNotMatch(line, /Error|Title|Ready|workspace/);
});
