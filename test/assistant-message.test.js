import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import { agentTimelineEntries, App } from "../src/ui/app.component.jsx";
import { AssistantMessage } from "../src/ui/assistant-message.component.jsx";
import { Welcome } from "../src/ui/welcome.component.jsx";

async function renderMessage(props) {
  const view = await testRender(React.createElement(AssistantMessage, props), {
    width: 60,
    height: 12,
  });
  await view.flush();
  return view;
}

test("splits agent timeline parts and streams only its final text entry", () => {
  const entries = agentTimelineEntries(
    {
      type: "agent",
      parts: [
        { type: "text", text: "Before tool" },
        { type: "tool", toolName: "read_file" },
        { type: "text", text: "After" },
        { type: "text", text: " tool" },
      ],
    },
    true,
  );

  assert.deepEqual(entries, [
    { type: "text", key: "text-0", responseText: "Before tool", generating: false },
    {
      type: "tool",
      key: "tool-1",
      part: { type: "tool", toolName: "read_file" },
    },
    { type: "text", key: "text-1", responseText: "After tool", generating: true },
  ]);
});

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

test("renders multiple fenced code blocks without exposing markdown markers", async () => {
  const content = [
    "# Markdown Rendering Test",
    "",
    "```sh",
    "npm config delete dns --location=user",
    "```",
    "",
    "```js",
    "function greet(name) {",
    "  return `Hello, ${name}!`;",
    "}",
    "",
    'console.log(greet("Xarab"));',
    "```",
  ].join("\n");
  const view = await testRender(
    React.createElement(AssistantMessage, { message: { message: content } }),
    { width: 80, height: 24 },
  );
  await view.flush();
  try {
    const frame = view.captureCharFrame();
    assert.match(frame, /npm config delete dns --location=user/);
    assert.match(frame, /function greet\(name\)/);
    assert.match(frame, /return `Hello, \$\{name\}!`;/);
    assert.doesNotMatch(frame, /```(?:sh|js)?/);
  } finally {
    await view.dispose();
  }
});

test("keeps streamed markdown concealed while code fences arrive incrementally", async () => {
  let updateState;
  const initialText = "# Example\n\n```js";
  const streamedText = [
    "# Example",
    "",
    "```js",
    "function greet(name) {",
    "  return `Hello, ${name}!`;",
  ].join("\n");
  const completedText = [...streamedText.split("\n"), "}", "```"].join("\n");

  function Harness() {
    const [state, setState] = useState({
      messages: [
        { type: "agent", message: initialText, parts: [{ type: "text", text: initialText }] },
      ],
      generating: true,
      sessionDraft: { value: "", cursor: 0 },
      status: "",
    });
    updateState = setState;
    return React.createElement(App, {
      state,
      onSubmit() {},
      onStopGeneration() {},
      onInterrupt() {},
      onDraftChange() {},
    });
  }

  function updateResponse(text, generating) {
    act(() => {
      updateState((state) => ({
        ...state,
        generating,
        messages: [
          {
            ...state.messages[0],
            message: text,
            parts: [{ type: "text", text }],
          },
        ],
      }));
    });
  }

  const view = await testRender(React.createElement(Harness), { width: 80, height: 24 });
  await view.flush();
  try {
    assert.doesNotMatch(view.captureCharFrame(), /```js|```/);

    updateResponse(streamedText, true);
    await view.flush();
    let frame = view.captureCharFrame();
    assert.doesNotMatch(frame, /```js|```/);

    updateResponse(completedText, true);
    await view.flush();
    frame = view.captureCharFrame();
    assert.doesNotMatch(frame, /```js|```/);

    updateResponse(completedText, false);
    await view.flush();
    frame = view.captureCharFrame();
    assert.match(frame, /function greet\(name\)/);
    assert.match(frame, /return `Hello, \$\{name\}!`;/);
    assert.doesNotMatch(frame, /```js|```/);
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

test("renders the welcome artwork without passing an array to a text node", async () => {
  const view = await testRender(React.createElement(Welcome), { width: 80, height: 24 });
  try {
    assert.equal(typeof view.captureCharFrame(), "string");
  } finally {
    await view.dispose();
  }
});
