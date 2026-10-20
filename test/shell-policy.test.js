import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { assessShellCommand } from "../src/agent/tools/shell-policy.js";

const workspace = path.resolve("/workspace/project");

test("allows simple read-only commands scoped to the workspace", () => {
  assert.equal(assessShellCommand("pwd", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("git status --short", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("sed -n '1,10p' src/app.js", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("find src -name '*.js'", workspace).requiresApproval, false);
  assert.equal(
    assessShellCommand("cat /workspace/project/src/app.js", workspace).requiresApproval,
    false,
  );
});

test("allows all npm commands without approval", () => {
  assert.equal(assessShellCommand("npm test", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("npm run custom", workspace).requiresApproval, false);
  assert.equal(
    assessShellCommand("npm install example-package", workspace).requiresApproval,
    false,
  );
  assert.equal(assessShellCommand("npm publish", workspace).requiresApproval, false);
});

test("allows other package managers only for workspace validation", () => {
  assert.equal(assessShellCommand("pnpm run build", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("node --test", workspace).requiresApproval, false);
});

test("allows git commands except commands that include force", () => {
  assert.equal(assessShellCommand("git reset --hard", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("git commit -m update", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("git push origin main", workspace).requiresApproval, false);
  assert.equal(
    assessShellCommand("git push --force origin main", workspace).requiresApproval,
    true,
  );
  assert.equal(assessShellCommand("git push --force-with-lease", workspace).requiresApproval, true);
});

test("requires approval for destructive commands and writes", () => {
  assert.equal(assessShellCommand("rm -f build/output", workspace).requiresApproval, true);
  assert.equal(assessShellCommand("echo data > output.txt", workspace).requiresApproval, true);
});

test("requires approval for in-place sed edits", () => {
  assert.equal(
    assessShellCommand("sed -i '' 's/old/new/' src/app.js", workspace).requiresApproval,
    true,
  );
});

test("allows read-only && chains and pipelines", () => {
  assert.equal(assessShellCommand("pwd && cat README.md", workspace).requiresApproval, false);
  assert.equal(
    assessShellCommand("git status --short && git diff", workspace).requiresApproval,
    false,
  );
  assert.equal(assessShellCommand("rg TODO src | head -n 10", workspace).requiresApproval, false);
  assert.equal(assessShellCommand("git diff | wc -l", workspace).requiresApproval, false);
});

test("requires approval when a composed stage is unsafe or unknown", () => {
  const destructive = assessShellCommand("pwd && rm -rf build", workspace);
  assert.equal(destructive.requiresApproval, true);
  assert.ok(
    destructive.reasons.some((reason) => reason.startsWith("Command stage 2 (rm -rf build):")),
  );
  assert.equal(assessShellCommand("git status | tee status.txt", workspace).requiresApproval, true);
  assert.equal(assessShellCommand("pwd && python script.py", workspace).requiresApproval, true);
});

test("requires approval for outside paths, unsupported shell syntax, and unknown commands", () => {
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
  for (const command of [
    "pwd || git status",
    "pwd; git status",
    "cat README.md > output.txt",
    "cat $(git status)",
    'cat "$(git status)"',
    "pwd & git status",
    "pwd &&",
    "| git status",
    "cat 'unterminated",
  ]) {
    assert.equal(assessShellCommand(command, workspace).requiresApproval, true, command);
  }
  assert.equal(assessShellCommand("python script.py", workspace).requiresApproval, true);
  assert.equal(assessShellCommand("pnpm run custom", workspace).requiresApproval, true);
});

test("does not split operators inside quoted arguments", () => {
  const assessment = assessShellCommand("rg 'TODO|FIXME && LATER' src", workspace);
  assert.equal(assessment.requiresApproval, false);
});
