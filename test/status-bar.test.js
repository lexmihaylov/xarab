import assert from "node:assert/strict";
import React from "react";
import test from "node:test";
import { renderToString } from "ink";
import { StatusBar } from "../src/ui/components/status-bar.component.jsx";

test("shows status without the local classifier", () => {
  const output = renderToString(
    React.createElement(StatusBar, {
      status: "Ready",
      width: 100,
    }),
  );
  assert.match(output, /Ready/);
  assert.doesNotMatch(output, /Classifier|classifier\.gguf/);
});

test("shows status and persistence errors", () => {
  const output = renderToString(
    React.createElement(StatusBar, {
      status: "Use \/route to configure the classifier and OpenAI workers",
      sessionError: "Session save failed",
      width: 100,
    }),
  );
  assert.match(output, /Session save failed/);
  assert.doesNotMatch(output, /GPU|CPU|Ctx/);
});
