import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import { createQuestionRequest } from "../src/agent/question-request.js";
import { createAskQuestionsTool } from "../src/agent/worker/tools/ask-questions-tool.js";
import { AskQuestionsDialog } from "../src/components/AskQuestionsDialog.component.jsx";

const questions = [
  { id: "color", question: "Which color?", type: "single", options: ["Red", "Blue"] },
];
test("question requests resolve, reject overlap, and clean up on abort", async () => {
  const bridge = createQuestionRequest();
  const controller = new AbortController();
  const result = bridge.request(questions, { signal: controller.signal });
  assert.equal(bridge.getState().questions, questions);
  assert.throws(() => bridge.request(questions), /already open/);
  controller.abort();
  assert.deepEqual(await result, { cancelled: true, answers: [] });
  assert.equal(bridge.getState(), undefined);
  const next = bridge.request(questions);
  bridge.respond([{ id: "color", choices: ["Blue"] }]);
  assert.equal((await next).cancelled, false);
});
test("question tool validates inputs and returns user answers", async () => {
  const tool = createAskQuestionsTool({
    requestQuestions: async () => ({ cancelled: false, answers: ["Blue"] }),
  });
  assert.equal((await tool.handler({ questions: [] })).ok, false);
  assert.equal((await tool.handler({ questions: [...questions, ...questions] })).ok, false);
  assert.equal((await tool.handler({ questions: [{ ...questions[0], options: [] }] })).ok, false);
  assert.deepEqual(JSON.parse((await tool.handler({ questions })).output).answers, ["Blue"]);
});
test("question dialog selects and submits a choice", async () => {
  let answer;
  const view = await testRender(
    React.createElement(AskQuestionsDialog, {
      questions,
      onAnswer: (value) => {
        answer = value;
      },
    }),
    { width: 100, height: 25 },
  );
  try {
    await view.flush();
    assert.match(view.captureCharFrame(), /Which color/);
    await act(async () => view.mockInput.pressArrow("down"));
    await act(async () => view.mockInput.pressEnter());
    await view.flush();
    await act(async () => view.mockInput.pressKey("n", { ctrl: true }));
    assert.deepEqual(answer[0].choices, ["Blue"]);
  } finally {
    await view.dispose();
  }
});

for (const width of [120, 80, 60]) {
  test(`question dialog validates and cancels at width ${width}`, async () => {
    let answer;
    const view = await testRender(
      React.createElement(AskQuestionsDialog, {
        questions,
        onAnswer: (value) => {
          answer = value;
        },
      }),
      { width, height: 24 },
    );
    try {
      await view.flush();
      await act(async () => view.mockInput.pressKey("n", { ctrl: true }));
      await view.flush();
      assert.match(view.captureCharFrame(), /Select an answer/);
      assert.equal(answer, undefined);
      await act(async () => {
        view.mockInput.pressEscape();
        // The terminal parser waits briefly to distinguish Escape from a sequence.
        await new Promise((resolve) => setTimeout(resolve, 100));
      });
      assert.equal(answer, null);
    } finally {
      await view.dispose();
    }
  });
}

test("question dialog preserves multiline drafts when navigating back", async () => {
  let answer;
  const view = await testRender(
    React.createElement(AskQuestionsDialog, {
      questions: [{ id: "notes", question: "Your notes?", type: "text" }, ...questions],
      onAnswer: (value) => {
        answer = value;
      },
    }),
    { width: 80, height: 24 },
  );
  try {
    await view.flush();
    assert.match(view.captureCharFrame(), /YOUR ANSWER/);
    await act(async () => view.mockInput.typeText("First line"));
    await act(async () => view.mockInput.pressEnter());
    await act(async () => view.mockInput.typeText("Second line"));
    await act(async () => view.mockInput.pressKey("n", { ctrl: true }));
    await act(async () => view.mockInput.pressKey("b", { ctrl: true }));
    await view.flush();
    assert.match(view.captureCharFrame(), /Second line/);
    await act(async () => view.mockInput.pressKey("n", { ctrl: true }));
    await act(async () => view.mockInput.pressEnter());
    await act(async () => view.mockInput.pressKey("n", { ctrl: true }));
    assert.equal(answer[0].text, "First line\nSecond line");
    assert.deepEqual(answer[1].choices, ["Red"]);
  } finally {
    await view.dispose();
  }
});
