import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { acquireInstanceLock } from "../src/instance-lock.js";

test("only one process can acquire a lock, and release makes it available", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-lock-test-"));
  const lockPath = path.join(directory, "instance.lock");
  try {
    const release = await acquireInstanceLock(lockPath);
    assert.equal(typeof release, "function");
    assert.equal(await acquireInstanceLock(lockPath), null);

    await release();
    const reacquired = await acquireInstanceLock(lockPath);
    assert.equal(typeof reacquired, "function");
    await reacquired();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a stale lock is reclaimed", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-lock-test-"));
  const lockPath = path.join(directory, "instance.lock");
  try {
    await writeFile(lockPath, JSON.stringify({ pid: 2 ** 30, token: "stale" }));
    const release = await acquireInstanceLock(lockPath);
    assert.equal(typeof release, "function");
    assert.notEqual(JSON.parse(await readFile(lockPath, "utf8")).token, "stale");
    await release();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
