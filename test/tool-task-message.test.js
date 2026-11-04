import test from "node:test";
import assert from "node:assert/strict";
import { ToolMessage } from "../src/components/ToolMessage.component.jsx";
import { ExecutionMessageCard } from "../src/components/ExecutionMessageCard.component.jsx";
test("task brief remains visible and provided context expands independently of output", () => {
  for (const status of ["running", "complete", "error"]) {
    const part = {
      toolName: "task",
      status,
      params: { brief: "Investigate the issue\nwithout edits", context: "First line\nSecond line" },
      summary: "Agent output",
    };
    const collapsed = ToolMessage({ part });
    const header = collapsed.props.headerChildren;
    assert.equal(
      header.props.children[0].props.children,
      "Task: Investigate the issue\nwithout edits",
    );
    assert.equal(header.props.children[1].props.children[1], false);
    assert.equal(
      header.props.children[2].props.children,
      status === "running" ? "Progress" : "Result",
    );
    const expanded = ToolMessage({ part, contextExpanded: true });
    assert.equal(
      expanded.props.headerChildren.props.children[1].props.children[1].props.children,
      part.params.context,
    );
  }
  const empty = ToolMessage({
    part: { toolName: "task", status: "running", params: { brief: "Check" } },
  });
  assert.ok(!empty.props.headerChildren.props.children[1]);
});

test("completed task summaries render as markdown while other summaries remain text", () => {
  const syntaxStyle = {};
  for (const [toolName, status, markdown] of [
    ["task", "complete", true],
    ["task", "running", false],
    ["task", "error", false],
    ["read_file", "complete", false],
  ]) {
    const tool = ToolMessage({ part: { toolName, status, summary: "**result**" }, syntaxStyle });
    const card = ExecutionMessageCard(tool.props);
    const body = card.props.children[2].props.children;
    assert.equal(body.type, markdown ? "markdown" : "text");
    if (markdown) {
      assert.equal(body.props.content, "**result**");
      assert.equal(body.props.syntaxStyle, syntaxStyle);
    } else assert.equal(body.props.children, "**result**");
  }
});

test("task activity is collapsed by default and exposes entries when expanded", () => {
  const part = {
    toolName: "task",
    title: "Task",
    status: "running",
    taskActivity: [{ callId: "1", label: "Executing npm test", status: "running" }],
  };
  const collapsed = ToolMessage({ part });
  const expanded = ToolMessage({ part, activityExpanded: true });
  assert.equal(collapsed.props.children[1].props.children[1], false);
  assert.equal(
    expanded.props.children[1].props.children[1][0].props.children,
    "… Executing npm test",
  );
});

test("unknown child outcomes are not displayed as successful", () => {
  const part = {
    toolName: "task",
    title: "Task",
    status: "error",
    taskActivity: [{ label: "Executing command", status: "unknown" }],
  };
  const expanded = ToolMessage({ part, activityExpanded: true });
  assert.equal(
    expanded.props.children[1].props.children[1][0].props.children,
    "? Executing command (outcome unknown)",
  );
});
test("task execution metadata is present for running, completed and failed tasks, including old sessions", () => {
  for (const status of ["running", "complete", "error"]) {
    for (const taskExecution of [undefined, "Tier 2 · openrouter · vendor/model"]) {
      const card = ToolMessage({
        part: { toolName: "task", title: "Task", status, taskExecution },
      });
      const metadata = card.props.children[0];
      if (taskExecution) assert.equal(metadata.props.children, taskExecution);
      else assert.ok(!metadata);
      const withAgent = ToolMessage({
        part: { toolName: "task", title: "Task", status, taskExecution, taskAgent: "reviewer" },
      });
      assert.equal(
        withAgent.props.children[0].props.children,
        ["Agent: reviewer", taskExecution].filter(Boolean).join(" · "),
      );
    }
  }
});
