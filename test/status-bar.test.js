import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { StatusBar } from "../src/components/StatusBar.component.jsx";

async function frame(props, width) {
  const view = await testRender(React.createElement(StatusBar, props), { width, height: 3 });
  try {
    await view.flush();
    return view.captureCharFrame().split("\n")[0];
  } finally {
    await act(async () => view.dispose());
  }
}

test("status bar shows title and status left, workspace right", async () => {
  const line = await frame(
    { sessionTitle: "Conversation", status: "Ready", workspace: "/home/project" },
    60,
  );
  assert.match(line, /^ Conversation\s+\/home\/project\s*$/);
  assert.doesNotMatch(line, /Session:/);
});

test("routine ready and worker-generating statuses are omitted", async () => {
  for (const status of ["Ready", "Worker generating…"]) {
    const line = await frame(
      { sessionTitle: "Conversation", status, workspace: "/home/project" },
      60,
    );
    assert.match(line, /^ Conversation\s+\/home\/project\s*$/);
    assert.doesNotMatch(line, /Worker generating|Ready|Session:/);
  }
});

test("long session title uses available space without the former fixed cap", async () => {
  const title = "A session title that comfortably exceeds thirty-two columns";
  const line = await frame({ sessionTitle: title, status: "Ready", workspace: "/repo" }, 100);
  assert.ok(line.includes(title), line);
  assert.match(line, /\/repo\s*$/);
});

test("status bar truncates long titles to fit narrow terminals", async () => {
  const title = "A very long session title that cannot fit";
  const line = await frame(
    { sessionTitle: title, status: "Ready", workspace: "/a/very/long/workspace" },
    24,
  );
  assert.doesNotMatch(line, /Ready|Worker generating|Session:/);
  assert.match(line, /A very l\.\.\./);
  assert.match(line, /\/a\//);
  assert.ok(line.length <= 24, line);

  const tiny = await frame({ sessionTitle: title, status: "Ready", workspace: "/workspace" }, 7);
  assert.ok(tiny.length <= 7, tiny);
  assert.doesNotMatch(tiny, /Ready|Worker generating|Session:/);
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
