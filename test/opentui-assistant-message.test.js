import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { testRender } from "@opentui/react/test-utils";
import { OpenTuiAssistantMessage } from "../src/ui/assistant-message.component.jsx";

async function renderMessage(props) {
  const view = await testRender(React.createElement(OpenTuiAssistantMessage, props), {
    width: 60,
    height: 12,
  });
  await view.flush();
  return view;
}

test("renders fenced agent response content as markdown", async () => {
  const view = await renderMessage({
    message: { message: "```text\nhello\n```" },
  });
  try {
    const frame = view.captureCharFrame();
    assert.match(frame, /hello/);
    assert.doesNotMatch(frame, /```text|```/);
  } finally {
    await view.dispose();
  }
});

test("renders the generating state without response text", async () => {
  const view = await renderMessage({ message: { message: "" }, generating: true });
  try {
    assert.match(view.captureCharFrame(), /Generating…/);
  } finally {
    await view.dispose();
  }
});
