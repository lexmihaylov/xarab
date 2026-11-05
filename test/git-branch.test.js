import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { getGitBranch } from "../src/utils/git-branch.js";

function git(cwd, ...args) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

test("detects branches, parent repositories and detached HEAD; ignores non-repositories", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "xarab-git-"));
  try {
    assert.equal(await getGitBranch(root), null);
    git(root, "init", "-b", "sample-branch");
    const nested = path.join(root, "nested");
    await mkdir(nested);
    assert.equal(await getGitBranch(nested), "sample-branch");
    git(
      root,
      "-c",
      "user.name=Test",
      "-c",
      "user.email=test@example.com",
      "commit",
      "--allow-empty",
      "-m",
      "initial",
    );
    git(root, "checkout", "--detach");
    assert.equal(await getGitBranch(root), git(root, "rev-parse", "--short", "HEAD"));
    assert.equal(await getGitBranch(path.join(root, "missing")), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
