import test from "node:test";
import assert from "node:assert/strict";
import { runShellCommand } from "../src/agent/shell-command.js";

test("runs a user-provided local command and captures stdout/stderr", async () => {
  const result = await runShellCommand("printf 'hello'; printf 'note' >&2; exit 3", {
    timeoutMs: 2_000,
  });
  assert.equal(result.code, 3);
  assert.equal(result.stdout, "hello");
  assert.equal(result.stderr, "note");
  assert.equal(result.timedOut, false);
});

test("bounds command output and marks truncation", async () => {
  const result = await runShellCommand("node -e \"process.stdout.write('x'.repeat(1000))\"", {
    maxOutputBytes: 100,
    timeoutMs: 2_000,
  });
  assert.equal(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), 100);
  assert.equal(result.truncated, true);
});

test("terminates commands that exceed the timeout", async () => {
  const result = await runShellCommand("sleep 2", { timeoutMs: 30 });
  assert.equal(result.timedOut, true);
});
