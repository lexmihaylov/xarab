import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import { agentTimelineEntries, App } from "../src/App.component.jsx";
import { AssistantMessage } from "../src/components/AssistantMessage.component.jsx";
import { ToolMessage } from "../src/components/ToolMessage.component.jsx";
import { Welcome } from "../src/components/Welcome.component.jsx";

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

test("does not render a successful file listing output body", async () => {
  const view = await testRender(
    React.createElement(ToolMessage, {
      part: {
        toolName: "list_files",
        status: "complete",
        title: "Listing files",
        summary: "Files in .:\nsrc/secret-file.js",
      },
    }),
    { width: 60, height: 12 },
  );
  await view.flush();
  try {
    const frame = view.captureCharFrame();
    assert.match(frame, /Listing files/);
    assert.doesNotMatch(frame, /Files in|secret-file/);
  } finally {
    await view.dispose();
  }
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

test("renders assistant markdown incrementally and finalizes the completed segment", async () => {
  let updateState;
  const initialText = "# Example\n\nFirst **bold** paragraph.\n\n";
  const streamedText = `${initialText}A second *unfinished`;
  const completedText = `${initialText}A second *unfinished* paragraph.`;

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
    assert.match(view.captureCharFrame(), /Example/);
    assert.doesNotMatch(view.captureCharFrame(), /# Example/);
    assert.match(view.captureCharFrame(), /First bold paragraph\./);

    updateResponse(streamedText, true);
    await view.flush();
    let frame = view.captureCharFrame();
    assert.match(frame, /A second \*unfinished/);

    updateResponse(completedText, false);
    await view.flush();
    frame = view.captureCharFrame();
    assert.match(frame, /A second unfinished paragraph\./);
    assert.doesNotMatch(frame, /\*unfinished\*/);
  } finally {
    await view.dispose();
  }
});

test("top-level streaming markdown conceals a heading while the following paragraph grows", async () => {
  let update;
  function Harness() {
    const [content, setContent] = useState("# Heading\n\n");
    update = setContent;
    return React.createElement("markdown", {
      content,
      streaming: true,
      conceal: true,
      internalBlockMode: "top-level",
    });
  }
  const view = await testRender(React.createElement(Harness), { width: 80, height: 12 });
  try {
    for (const content of ["# Heading\n\n", "# Heading\n\nA", "# Heading\n\nA paragraph grows."]) {
      act(() => update(content));
      await view.renderOnce();
      const immediate = view.captureCharFrame();
      await view.flush();
      const settled = view.captureCharFrame();
      for (const frame of [immediate, settled]) {
        assert.match(frame, /Heading/);
        assert.doesNotMatch(frame, /# Heading/);
      }
    }
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
