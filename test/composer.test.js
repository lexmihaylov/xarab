import assert from "node:assert/strict";
import test from "node:test";
import React, { act, useState } from "react";
import { testRender } from "@opentui/react/test-utils";
import { Composer } from "../src/components/Composer.component.jsx";

test("shows loading and queue guidance while messages are queued", async () => {
  const view = await testRender(
    React.createElement(Composer, {
      draft: { value: "", cursor: 0 },
      generating: true,
      queuedMessages: [{ id: "queued-1", text: "Follow-up request" }],
      onStopGeneration: () => {},
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
    assert.match(frame, /Enter queue/);
    assert.match(frame, /Esc stop/);
    assert.doesNotMatch(frame, /PgUp|PgDn/);
    assert.match(frame, /█████/);
  } finally {
    await act(async () => view.dispose());
  }
});

test("ready hotkey guidance appears on the right at narrow and standard widths", async () => {
  for (const width of [80, 40]) {
    const view = await testRender(
      React.createElement(Composer, {
        draft: { value: "", cursor: 0 },
        onDraftChange: () => {},
        onSubmit: () => {},
      }),
      { width, height: 14 },
    );
    try {
      await view.flush();
      const frame = view.captureCharFrame();
      assert.match(frame, /Ctrl\+J newline/);
      assert.match(frame, /Enter send/);
      assert.doesNotMatch(frame, /PgUp|PgDn|Esc stop/);
      const hintLine = frame.split("\n").find((line) => line.includes("Enter send"));
      assert.ok(hintLine);
      assert.ok(hintLine.indexOf("Ctrl+J newline") > 2, hintLine);
    } finally {
      await act(async () => view.dispose());
    }
  }
});

test("generating hotkey guidance appears beside the loading indicator at narrow widths", async () => {
  const view = await testRender(
    React.createElement(Composer, {
      generating: true,
      onStopGeneration: () => {},
      onDraftChange: () => {},
      onSubmit: () => {},
    }),
    { width: 40, height: 14 },
  );
  try {
    await view.flush();
    const frame = view.captureCharFrame();
    assert.match(frame, /Enter queue/);
    assert.match(frame, /Ctrl\+J newline/);
    assert.match(frame, /Esc stop/);
    assert.match(frame, /█████/);
    const hintLine = frame.split("\n").find((line) => line.includes("Enter queue"));
    assert.ok(hintLine.indexOf("Enter queue") > 5, hintLine);
  } finally {
    await act(async () => view.dispose());
  }
});

test("disabled state omits the redundant interrupt guidance row", async () => {
  const view = await testRender(
    React.createElement(Composer, {
      disabled: true,
      queuedMessages: [{ id: "one", text: "queued" }],
      onDraftChange: () => {},
      onSubmit: () => {},
    }),
    { width: 60, height: 14 },
  );
  try {
    await view.flush();
    const frame = view.captureCharFrame();
    assert.match(frame, /Queued \(1\)/);
    assert.doesNotMatch(frame, /Ctrl\+C interrupt|Ctrl\+X|Esc stop|Enter send|Enter queue/);
  } finally {
    await act(async () => view.dispose());
  }
});

test("indicator stays visible and animates only while generating across transitions", async () => {
  for (const width of [40, 80]) {
    let setStatus;
    function Wrapper() {
      const [status, updateStatus] = useState({ generating: false, disabled: false });
      setStatus = updateStatus;
      return React.createElement(Composer, {
        ...status,
        onStopGeneration: () => {},
        onDraftChange: () => {},
        onSubmit: () => {},
      });
    }
    const view = await testRender(React.createElement(Wrapper), { width, height: 14 });
    const colors = () =>
      JSON.stringify(
        view
          .captureSpans()
          .lines.flatMap((line) =>
            line.spans.filter((span) => span.text.includes("█")).map((span) => span.fg),
          ),
      );
    const wait = () => act(async () => new Promise((resolve) => setTimeout(resolve, 160)));
    try {
      await view.flush();
      assert.match(view.captureCharFrame(), /\[█████\]/);
      assert.match(view.captureCharFrame(), /Enter send/);
      const idle = colors();
      await wait();
      await view.flush();
      assert.equal(colors(), idle);

      await act(async () => setStatus({ generating: true, disabled: false }));
      await view.flush();
      assert.match(view.captureCharFrame(), /\[█████\]/);
      assert.match(view.captureCharFrame(), /Enter queue/);
      const generating = colors();
      await wait();
      await view.flush();
      assert.notEqual(colors(), generating);

      await act(async () => setStatus({ generating: false, disabled: true }));
      await view.flush();
      assert.match(view.captureCharFrame(), /\[█████\]/);
      assert.doesNotMatch(view.captureCharFrame(), /Enter send|Enter queue|Ctrl\+C interrupt/);
      const disabled = colors();
      await wait();
      await view.flush();
      assert.equal(colors(), disabled);
      assert.equal(disabled, idle);

      await act(async () => setStatus({ generating: false, disabled: false }));
      await view.flush();
      assert.match(view.captureCharFrame(), /\[█████\]/);
      assert.match(view.captureCharFrame(), /Enter send/);
    } finally {
      await act(async () => view.dispose());
    }
  }
});
test("Shift+Enter and Ctrl+J insert newlines while Enter submits", async () => {
  const submitted = [];
  const drafts = [];
  const view = await testRender(
    React.createElement(Composer, {
      draft: { value: "", cursor: 0 },
      onDraftChange: (draft) => drafts.push(draft),
      onSubmit: (value) => submitted.push(value),
    }),
    { width: 80, height: 14 },
  );
  try {
    await view.flush();
    await act(async () => view.mockInput.pasteBracketedText("first"));
    await view.flush();
    await act(async () => view.mockInput.pressKeys(["\u001b[13;2u"]));
    await view.flush();
    assert.equal(drafts.at(-1).value, "first\n");
    assert.deepEqual(submitted, []);

    await act(async () => view.mockInput.pressKey("j", { ctrl: true }));
    await view.flush();
    assert.equal(drafts.at(-1).value, "first\n\n");
    assert.deepEqual(submitted, []);

    await act(async () => view.mockInput.pressEnter());
    await view.flush();
    assert.deepEqual(submitted, ["first\n\n"]);
  } finally {
    await act(async () => view.dispose());
  }
});

test("multiline prompt keeps the context count below the final line", async () => {
  const prompt = "first line\nsecond line\nfinal prompt line";
  const view = await testRender(
    React.createElement(Composer, {
      draft: { value: prompt, cursor: prompt.length },
      contextTokens: 15428,
      onDraftChange: () => {},
      onSubmit: () => {},
    }),
    { width: 80, height: 14 },
  );
  try {
    await view.flush();
    const lines = view.captureCharFrame().split("\n");
    const finalPromptLine = lines.findIndex((line) => line.includes("final prompt line"));
    const contextLine = lines.findIndex((line) => line.includes("15,428 tokens"));
    assert.notEqual(finalPromptLine, -1);
    assert.notEqual(contextLine, -1);
    assert.ok(contextLine > finalPromptLine, lines.join("\\n"));
  } finally {
    await act(async () => view.dispose());
  }
});

test("long multiline input scrolls with the cursor inside the eight-row composer", async () => {
  const prompt = Array.from(
    { length: 12 },
    (_, i) => `line ${String(i + 1).padStart(2, "0")}`,
  ).join("\n");
  const drafts = [];
  const view = await testRender(
    React.createElement(Composer, {
      draft: { value: "", cursor: 0 },
      contextTokens: 15428,
      onDraftChange: (draft) => drafts.push(draft),
      onSubmit: () => {},
    }),
    { width: 80, height: 20 },
  );
  try {
    await view.flush();
    await act(async () => view.mockInput.pasteBracketedText(prompt));
    await view.flush();
    let lines = view.captureCharFrame().split("\n");
    let cursor = view.renderer.getCursorState();
    const top = lines.findIndex((line) => line.includes("╭"));
    const bottom = lines.findIndex((line) => line.includes("╰"));
    assert.equal(bottom - top + 1, 8, lines.join("\n"));
    assert.match(lines.join("\n"), /line 12/);
    assert.ok(
      cursor.visible && cursor.y - 1 > top && cursor.y - 1 < bottom,
      JSON.stringify(cursor),
    );
    assert.ok(
      lines[cursor.y - 1].includes("line 12"),
      JSON.stringify(cursor) + "\n" + lines.join("\n"),
    );
    assert.ok(lines.findIndex((line) => line.includes("15,428 tokens")) > cursor.y - 1);
    assert.equal(drafts.at(-1).value, prompt);
    for (let i = 0; i < 11; i++) {
      await act(async () => view.mockInput.pressArrow("up"));
    }
    await view.flush();
    lines = view.captureCharFrame().split("\n");
    cursor = view.renderer.getCursorState();
    assert.match(lines.join("\n"), /line 01/);
    assert.ok(
      cursor.visible && cursor.y - 1 > top && cursor.y - 1 < bottom,
      JSON.stringify(cursor),
    );
    assert.ok(lines[cursor.y - 1].includes("line 01"), lines.join("\n"));
    assert.ok(lines.findIndex((line) => line.includes("15,428 tokens")) > cursor.y - 1);
  } finally {
    await act(async () => view.dispose());
  }
});

test("a suggestion arriving after mount wraps at the composer width", async () => {
  const suggestion =
    "I’ll send a screenshot and the exact suggestion, terminal width, and whether it happens before or after pressing Tab.";
  let setSuggestion;
  const drafts = [];
  function Wrapper() {
    const [messageSuggestion, updateSuggestion] = useState(null);
    setSuggestion = updateSuggestion;
    return React.createElement(Composer, {
      sessionId: "one",
      draft: { value: "", cursor: 0 },
      messageSuggestion,
      contextTokens: 15428,
      onDraftChange: (draft) => drafts.push(draft),
      onSubmit: () => {},
    });
  }
  const view = await testRender(React.createElement(Wrapper), { width: 80, height: 14 });
  try {
    await view.flush();
    await act(async () => setSuggestion(suggestion));
    await view.flush();
    assert.match(view.captureCharFrame(), /I’ll send a screenshot and the exact suggestion/);
    await act(async () => view.mockInput.pressTab());
    await view.flush();
    assert.match(view.captureCharFrame(), /I’ll send a screenshot and the exact suggestion/);
    assert.equal(drafts.at(-1).value, suggestion);
  } finally {
    await act(async () => view.dispose());
  }
});

test("a suggestion survives draft callbacks when the textarea remounts", async () => {
  let setSuggestion;
  function Wrapper() {
    const [messageSuggestion, updateSuggestion] = useState(null);
    const [draft, setDraft] = useState({ value: "", cursor: 0 });
    setSuggestion = updateSuggestion;
    return React.createElement(Composer, {
      sessionId: "one",
      draft,
      messageSuggestion,
      onDraftChange: (nextDraft) => {
        updateSuggestion(null);
        setDraft(nextDraft);
      },
      onSubmit: () => {},
    });
  }
  const view = await testRender(React.createElement(Wrapper), { width: 80, height: 14 });
  try {
    await view.flush();
    await act(async () => setSuggestion("Explain the result"));
    await view.flush();
    assert.match(view.captureCharFrame(), /Explain the result/);
    await act(async () => view.mockInput.pressTab());
    await view.flush();
    assert.match(view.captureCharFrame(), /Explain the result/);
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
