import test from "node:test";
import assert from "node:assert/strict";
import { ToolMessage } from "../src/components/ToolMessage.component.jsx";
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
