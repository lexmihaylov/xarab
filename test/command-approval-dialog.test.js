import test from "node:test";
import assert from "node:assert/strict";
import React, { act } from "react";
import { testRender } from "@opentui/react/test-utils";
import {
  CommandApprovalDialog,
  visibleCommand,
} from "../src/components/CommandApprovalDialog.component.jsx";

const commandApproval = {
  command: "rm ../outside",
  workspace: "/work",
  risk: "high",
  scope: "outside",
  reason: "Deletes outside workspace",
};
async function press(view, key) {
  await act(async () => {
    if (key === "return") view.mockInput.pressEnter();
    else if (key === "tab") view.mockInput.pressTab();
    else if (key === "escape") view.mockInput.pressEscape();
    else view.mockInput.pressKey(key);
  });
  await view.flush();
}

test("approval dialog defaults to denial and returns typed feedback", async () => {
  const answers = [];
  const view = await testRender(
    React.createElement(CommandApprovalDialog, {
      commandApproval,
      onAnswer: (value) => answers.push(value),
    }),
    { width: 80, height: 24 },
  );
  try {
    await view.flush();
    assert.match(view.captureCharFrame(), /COMMAND APPROVAL/);
    assert.match(view.captureCharFrame(), /rm \.\.\/outside/);
    await press(view, "tab");
    await act(async () => view.mockInput.typeText("Use a workspace path"));
    await view.flush();
    await press(view, "tab");
    await press(view, "return");
    assert.equal(answers[0][0].choices[0], "Deny");
    assert.equal(answers[0][0].text, "Use a workspace path");
  } finally {
    await act(async () => view.dispose());
  }
});

test("approval requires action focus and explicit selection; Ctrl-C cancels", async () => {
  const answers = [];
  const view = await testRender(
    React.createElement(CommandApprovalDialog, {
      commandApproval,
      onAnswer: (value) => answers.push(value),
    }),
    { width: 60, height: 18 },
  );
  try {
    await view.flush();
    await press(view, "return");
    assert.equal(answers.length, 0);
    await press(view, "tab");
    await press(view, "tab");
    await act(async () => view.mockInput.pressArrow("right"));
    await press(view, "return");
    assert.equal(answers[0][0].choices[0], "Approve once");
    await act(async () => view.mockInput.pressKey("c", { ctrl: true }));
    await view.flush();
    assert.equal(answers[1], null);
  } finally {
    await act(async () => view.dispose());
  }
});

test("long multiline commands remain scrollable with actions visible", async () => {
  const command = Array.from({ length: 100 }, (_, i) => `echo line-${i}`).join("\n");
  const view = await testRender(
    React.createElement(CommandApprovalDialog, {
      commandApproval: { ...commandApproval, command },
      onAnswer() {},
    }),
    { width: 120, height: 40 },
  );
  try {
    await view.flush();
    assert.match(view.captureCharFrame(), /echo line-0/);
    for (let i = 0; i < 110; i++) {
      await act(async () => view.mockInput.pressArrow("down"));
    }
    await view.flush();
    assert.match(view.captureCharFrame(), /echo line-99/);
    assert.match(view.captureCharFrame(), /Approve once/);
  } finally {
    await act(async () => view.dispose());
  }
});

test("command display distinguishes literal escape sequences from controls", () => {
  assert.equal(visibleCommand("a\r\u001b\u202eb\n"), "a\\u000d\\u001b\\u202eb\n");
  assert.notEqual(visibleCommand("\\u001b"), visibleCommand("\u001b"));
});
