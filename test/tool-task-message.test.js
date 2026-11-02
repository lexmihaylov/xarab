import test from "node:test";
import assert from "node:assert/strict";
import { ToolMessage } from "../src/components/ToolMessage.component.jsx";

test("task execution metadata is present for running, completed and failed tasks, including old sessions", () => {
  for (const status of ["running", "complete", "error"]) {
    for (const taskExecution of [undefined, "Tier 2 · openrouter · vendor/model"]) {
      const card = ToolMessage({
        part: { toolName: "task", title: "Task", status, taskExecution },
      });
      const metadata = card.props.children[0];
      if (taskExecution) assert.equal(metadata.props.children, taskExecution);
      else assert.ok(!metadata);
    }
  }
});
