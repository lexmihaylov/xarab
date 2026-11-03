import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { Composer } from "../src/components/Composer.component.jsx";

test("shows loading and scroll guidance while messages are queued", async () => {
  const view = await testRender(
    React.createElement(Composer, {
      draft: { value: "", cursor: 0 },
      generating: true,
      queuedMessages: [{ id: "queued-1", text: "Follow-up request" }],
      onDraftChange: () => {},
      onSubmit: () => {},
    }),
    { width: 100, height: 14 },
  );
  try {
    await view.flush();
    const frame = view.captureCharFrame();
    assert.match(frame, /Queued \(1\)/);
    assert.match(frame, /Follow-up request/);
    assert.match(frame, /PgUp\/PgDn scroll/);
    assert.match(frame, /Enter queue/);
    assert.match(frame, /Esc stop/);
    assert.match(frame, /█████/);
  } finally {
    await act(async () => view.dispose());
  }
});

test("composer displays a suggestion and Tab accepts it as a draft", async () => {
  const drafts = [];
  const submissions = [];
  const view = await testRender(
    React.createElement(Composer, {
      sessionId: "one",
      draft: { value: "", cursor: 0 },
      messageSuggestion: "Could you explain more?",
      onDraftChange: (draft) => drafts.push(draft),
      onSubmit: (text) => submissions.push(text),
    }),
    { width: 100, height: 12 },
  );
  try {
    await view.flush();
    assert.match(view.captureCharFrame(), /Could you explain more\?/);
    await act(async () => view.mockInput.pressEnter());
    assert.deepEqual(submissions, []);
    await act(async () => view.mockInput.pressTab());
    await view.flush();
    assert.deepEqual(drafts.at(-1), { value: "Could you explain more?", cursor: 23 });
    assert.match(view.captureCharFrame(), /Could you explain more\?/);
    assert.deepEqual(submissions, []);
    await act(async () => view.mockInput.pressEnter());
    await view.flush();
    assert.deepEqual(submissions, ["Could you explain more?"]);
    assert.deepEqual(drafts.at(-1), { value: "", cursor: 0 });
  } finally {
    await act(async () => view.dispose());
  }
});
