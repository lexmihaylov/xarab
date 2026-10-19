import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToString } from "ink";
import { App } from "../src/ui/app.component.jsx";
import { Composer } from "../src/ui/components/composer.component.jsx";

test("renders the chat, status, and composer through Ink", () => {
  const output = renderToString(
    React.createElement(App, {
      state: {
        messages: [{ type: "user", message: "Hello from Ink", color: "#8fbfdc" }],
        classifierModel: "/models/classifier.gguf",
        status: "Ready",
        generating: false,
      },
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
    }),
  );

  assert.match(output, /Ready/);
  assert.doesNotMatch(output, /classifier\.gguf/);
  assert.match(output, /Hello from Ink/);
  assert.doesNotMatch(output, /User/);
  assert.match(output, /Enter send/);
  assert.ok(output.indexOf("Enter send") < output.indexOf("Ready"));
});

test("shows the editable pixel-art welcome message when the chat is empty", () => {
  const output = renderToString(
    React.createElement(App, {
      state: {
        messages: [],
        classifierModel: null,
        status: "Use \/route to configure routing",
        generating: false,
      },
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
    }),
  );

  assert.match(output, /AI CODING ASSISTANT/);
  assert.match(output, /Smart routing · workspace-aware tools/);
  assert.match(output, /[█▀▄]/);
  assert.match(output, /XARAB/);
  assert.ok(
    output.indexOf("XARAB") >
      Math.max(...["█", "▀", "▄"].map((pixel) => output.lastIndexOf(pixel))),
  );
  assert.ok(output.indexOf("XARAB") < output.indexOf("AI CODING ASSISTANT"));
  assert.match(output, /Ask a question or describe a change/);
  assert.match(output, /Type !command to run a local command/);
});

test("renders selectable slash-command suggestions above the composer", () => {
  const output = renderToString(
    React.createElement(Composer, {
      value: "/co",
      cursor: 3,
      width: 80,
      suggestions: [{ command: "/clear", description: "Clear conversation" }],
      selectedSuggestionIndex: 0,
    }),
  );

  assert.match(output, /\/clear/);
  assert.match(output, /Tab complete/);
});

test("shows a generating indicator while the assistant response is empty", () => {
  const output = renderToString(
    React.createElement(App, {
      state: {
        messages: [{ type: "agent", message: "", parts: [], color: "#a8d5a2" }],
        modelPath: "/models/test.gguf",
        model: null,
        status: "Generating…",
        generating: true,
      },
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
    }),
  );

  assert.match(output, /Generating/);
  assert.match(output, /Waiting for response/);
  assert.doesNotMatch(output, /Enter send/);
  assert.doesNotMatch(output, /Agent/);
});

test("shows the active tool with a spinner while it runs", () => {
  const output = renderToString(
    React.createElement(App, {
      state: {
        messages: [
          {
            type: "agent",
            message: "",
            parts: [
              {
                type: "tool",
                id: "tool-1",
                label: "Reading src/example.js",
                title: "Reading src/example.js",
                status: "running",
              },
            ],
            color: "#a8d5a2",
          },
        ],
        modelPath: "/models/test.gguf",
        model: null,
        status: "Generating…",
        generating: true,
      },
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
    }),
  );

  assert.match(output, /Reading src\/example\.js/);
  assert.doesNotMatch(output, /⠋ Generating(?:\n|$)/);
});

test("shows completed tool activity after the spinner is cleared", () => {
  const output = renderToString(
    React.createElement(App, {
      state: {
        messages: [
          {
            type: "agent",
            message: "",
            parts: [
              {
                type: "tool",
                id: "tool-1",
                label: "Reading src/example.js",
                title: "Reading src/example.js",
                status: "complete",
                summary: "Read src/example.js (123 bytes)",
              },
            ],
            color: "#a8d5a2",
          },
        ],
        modelPath: "/models/test.gguf",
        model: null,
        status: "Generating…",
        generating: true,
      },
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
    }),
  );

  assert.match(output, /Reading src\/example\.js/);
  assert.match(output, /Read src\/example\.js \(123 bytes\)/);
  assert.doesNotMatch(output, /⠋ Generating(?:\n|$)/);
});

test("renders agent intent as a dim unboxed note", () => {
  const output = renderToString(
    React.createElement(App, {
      state: {
        messages: [
          { type: "intent", message: "I’ll inspect the workspace first.", color: "#aeb8c4" },
        ],
        modelPath: "/models/test.gguf",
        model: null,
        status: "Generating…",
        generating: true,
      },
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
    }),
  );

  assert.match(output, /I’ll inspect the workspace first/);
  assert.doesNotMatch(output, /Agent Intent/);
});

test("renders system messages with a label and without a text-breaking border", () => {
  const output = renderToString(
    React.createElement(App, {
      state: {
        messages: [
          { type: "system", message: "Model warning", severity: "warning", color: "#e6b17e" },
        ],
        modelPath: "/models/test.gguf",
        model: null,
        status: "Ready",
        generating: false,
      },
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
    }),
  );

  assert.doesNotMatch(output, /│ Model warning/);
  assert.match(output, /System · Warning/);
  assert.match(output, /Model warning/);
});
