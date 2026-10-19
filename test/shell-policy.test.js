import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { assessShellCommand } from "../src/agent/shell-policy.js";

const workspace = path.resolve("/workspace/project");

test("allows simple read-only commands scoped to the workspace", () => {
  assert.equal(assessShellCommand("pwd", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("git status --short", workspace).requiresApproval, false);
  assert.equal(
    assessShellCommand("cat /workspace/project/src/app.js", workspace).requiresApproval,
    false,
  );
});

test("allows common workspace validation commands without approval", () => {
  assert.equal(assessShellCommand("npm test", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("npm run lint", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("pnpm run build", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("node --test", workspace).requiresApproval, false);
});

test("requires approval for destructive commands and writes", () => {
  assert.equal(assessShellCommand("rm -f build/output", workspace).requiresApproval, true);
  assert.equal(assessShellCommand("echo data > output.txt", workspace).requiresApproval, true);
  assert.equal(assessShellCommand("git reset --hard", workspace).requiresApproval, true);
});

test("requires approval for outside paths, shell composition, and unknown commands", () => {
  assert.ok(
    assessShellCommand("cat ../secret.txt", workspace).reasons.some((reason) =>
      reason.includes("outside"),
    ),
  );
  assert.ok(
    assessShellCommand("cat /etc/passwd", workspace).reasons.some((reason) =>
      reason.includes("outside"),
    ),
  );
  assert.equal(assessShellCommand("pwd && cat README.md", workspace).requiresApproval, true);
  assert.equal(assessShellCommand("python script.py", workspace).requiresApproval, true);
  assert.equal(assessShellCommand("npm run custom", workspace).requiresApproval, true);
});
