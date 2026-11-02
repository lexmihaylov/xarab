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

test("approval dialog emphasizes risk details and initially selects approval", async () => {
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
    const frame = view.captureCharFrame();
    assert.match(frame, /COMMAND APPROVAL/);
    assert.match(frame, /rm \.\.\/outside/);
    assert.match(frame, /OPTIONAL DENIAL FEEDBACK/);
    assert.match(frame, /RISK: HIGH/);
    assert.match(frame, /SCOPE: OUTSIDE WORKSPACE/);
    assert.match(frame, /Deletes outside workspace/);
    assert.match(frame, /\[ Deny \]/);
    assert.match(frame, /\[ Approve \]/);
    await press(view, "return");
    assert.equal(answers[0][0].choices[0], "Approve");
  } finally {
    await act(async () => view.dispose());
  }
});

test("approve is preselected; denial requires selecting it; Ctrl-C cancels", async () => {
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
    assert.equal(answers[0][0].choices[0], "Approve");
    await act(async () => view.mockInput.pressArrow("left"));
    await press(view, "return");
    assert.equal(answers[1][0].choices[0], "Deny");
  } finally {
    await act(async () => view.dispose());
  }
});

test("narrow terminals show a safe enlarge/cancel fallback", async () => {
  const view = await testRender(
    React.createElement(CommandApprovalDialog, { commandApproval, onAnswer() {} }),
    { width: 40, height: 18 },
  );
  try {
    await view.flush();
    const frame = view.captureCharFrame();
    assert.match(frame, /Enlarge the terminal/);
    assert.match(frame.replace(/\s+/g, " "), /Approval is not granted/);
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
    await press(view, "tab");
    for (let i = 0; i < 110; i++) {
      await act(async () => view.mockInput.pressArrow("down"));
    }
    await view.flush();
    assert.match(view.captureCharFrame(), /echo line-99/);
    assert.match(view.captureCharFrame(), /\[ Approve \]/);
  } finally {
    await act(async () => view.dispose());
  }
});

test("command display distinguishes literal escape sequences from controls", () => {
  assert.equal(visibleCommand("a\r\u001b\u202eb\n"), "a\\u000d\\u001b\\u202eb\n");
  assert.notEqual(visibleCommand("\\u001b"), visibleCommand("\u001b"));
});
