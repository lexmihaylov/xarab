import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createShellTool } from "../src/agent/tools/shell-tool.js";

test("runs an allowlisted read-only command from the workspace", async () => {
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

test("does not run a risky command when approval is declined", async () => {
  let askedForApproval = false;
  const tool = createShellTool({
    requestApproval: async (command, reasons) => {
      askedForApproval = command === "rm definitely-not-run" && reasons.length > 0;
      return false;
    },
  });
  const result = await tool.handler({ command: "rm definitely-not-run" });
  assert.equal(askedForApproval, true);
  assert.match(result, /declined approval/);
});

test("compacts verbose command output while retaining relevant error lines", async () => {
  const tool = createShellTool({ requestApproval: async () => true });
  const result = await tool.handler({
    command: `node -e "for(let i=0;i<500;i++) console.log(i===300?'ERROR important failure':'noise '.repeat(20))"`,
  });
  assert.match(result, /ERROR important failure/);
  assert.match(result, /lines; .* omitted/);
  assert.ok(Buffer.byteLength(result) <= 8 * 1024);
});
