import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createShellTool } from "../src/agent/tools/shell-tool.js";

test("runs a command from the workspace", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "xarab-agent-shell-"));
  try {
    const tool = createShellTool({ workspace });
    const result = await tool.handler({ command: "pwd" });
    assert.match(result, new RegExp(workspace.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(result, /Exit code: 0/);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("compacts verbose command output while retaining relevant error lines", async () => {
  const tool = createShellTool();
  const result = await tool.handler({
    command: `node -e "for(let i=0;i<500;i++) console.log(i===300?'ERROR important failure':'noise '.repeat(20))"`,
  });
  assert.match(result, /ERROR important failure/);
  assert.match(result, /lines; .* omitted/);
  assert.ok(Buffer.byteLength(result) <= 8 * 1024);
});
