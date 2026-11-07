import test from "node:test";
import assert from "node:assert/strict";
import { ToolMessage } from "../src/components/ToolMessage.component.jsx";
import { ExecutionMessageCard } from "../src/components/ExecutionMessageCard.component.jsx";
test("partial tool arguments are bounded, literal, and clearly not executed", () => {
  for (const toolName of ["task", "list_files", "run_command"]) {
    const part = {
      toolName,
      status: "running",
      preview: true,
      previewArguments: '{"command":"hello\n\u001b' + "x".repeat(600),
      summary: "unbounded summary",
    };
    const card = ToolMessage({ part });
    assert.equal(
      card.props.headerChildren.props.children,
      "Streaming parameters · not yet executed",
    );
    assert.ok(card.props.summary.startsWith('{"command":"hello\\n\\x1b'));
    assert.ok(card.props.summary.endsWith("… [preview truncated]"));
    assert.ok(card.props.summary.length < 550);
    assert.equal(card.props.summaryMarkdown, false);
    assert.equal(card.props.summaryStreaming, false);
    const abandoned = ToolMessage({ part: { ...part, status: "error" } });
    assert.equal(
      abandoned.props.headerChildren.props.children,
      "Incomplete parameters · not executed",
    );
    assert.equal(abandoned.props.summary, card.props.summary);
  }
  const empty = ToolMessage({ part: { toolName: "list_files", status: "running", preview: true } });
  assert.equal(empty.props.summary, "");
  const executed = ToolMessage({
    part: { toolName: "list_files", status: "running", summary: "output", previewArguments: "old" },
  });
  assert.equal(executed.props.summary, "");
  assert.ok(!executed.props.headerChildren);
});

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

test("running and completed task summaries render as streaming and finalized markdown", () => {
  const syntaxStyle = {};
  for (const [toolName, status, markdown, streaming] of [
    ["task", "complete", true, false],
    ["task", "running", true, true],
    ["task", "error", false, false],
    ["analyze_image", "complete", true, false],
    ["analyze_image", "running", false, false],
    ["analyze_image", "error", false, false],
    ["websearch", "complete", true, false],
    ["websearch", "running", false, false],
    ["websearch", "error", false, false],
    ["read_file", "complete", false, false],
  ]) {
    const tool = ToolMessage({ part: { toolName, status, summary: "**result**" }, syntaxStyle });
    const card = ExecutionMessageCard(tool.props);
    const body = card.props.children[2].props.children;
    assert.equal(body.type, markdown ? "markdown" : "text");
    if (markdown) {
      assert.equal(body.props.content, "**result**");
      assert.equal(body.props.syntaxStyle, syntaxStyle);
      assert.equal(body.props.streaming, streaming);
      assert.equal(body.props.internalBlockMode, "top-level");
      assert.equal(body.props.tableOptions.style, "grid");
    } else assert.equal(body.props.children, "**result**");
  }
});

test("web search result text is passed unchanged to the markdown renderer", () => {
  const summary =
    "Web search results for: example\n\n1. Example title\nURL: https://example.com\nExcerpt: An **example** result.";
  const tool = ToolMessage({ part: { toolName: "websearch", status: "complete", summary } });
  const body = ExecutionMessageCard(tool.props).props.children[2].props.children;
  assert.equal(body.type, "markdown");
  assert.equal(body.props.content, summary);
  assert.equal(body.props.streaming, false);
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
