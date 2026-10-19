import { randomUUID } from "node:crypto";
import { open, readFile, stat, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function lockPathForCurrentUser() {
  return path.join(os.tmpdir(), "xarab-router.lock");
}

function isProcessRunning(pid) {
  if (!Number.isInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

export async function acquireInstanceLock(lockPath = lockPathForCurrentUser()) {
  const token = randomUUID();
  const contents = JSON.stringify({ pid: process.pid, token });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let handle;
    try {
      // Keep the owner record readable across users so the system-wide lock
      // can report whether another user's process is still running.
      handle = await open(lockPath, "wx", 0o666);
      await handle.writeFile(contents);
      await handle.close();
      handle = undefined;
      return async () => {
        try {
          const current = JSON.parse(await readFile(lockPath, "utf8"));
          if (current.token === token) await unlink(lockPath);
        } catch (error) {
          if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error;
        }
      };
    } catch (error) {
      await handle?.close().catch(() => {});
      if (error.code !== "EEXIST") throw error;
    }

    let existing;
    let before;
    try {
      before = await stat(lockPath);
      existing = JSON.parse(await readFile(lockPath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT" || error instanceof SyntaxError) continue;
      throw error;
    }
    if (isProcessRunning(existing.pid)) return null;

    // Only remove the stale lock we inspected; another launcher may have
    // replaced it while we checked the PID.
    try {
      const current = await stat(lockPath);
      if (current.dev === before.dev && current.ino === before.ino) await unlink(lockPath);
    } catch (error) {
      if (error.code === "EACCES" || error.code === "EPERM") return null;
      if (error.code !== "ENOENT") throw error;
    }
  }

  return null;
}
