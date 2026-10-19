import { spawn } from "node:child_process";

export function runShellCommand(
  command,
  { cwd = process.cwd(), timeoutMs = 30_000, maxOutputBytes = 64 * 1024 } = {},
) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, {
        cwd,
        shell: true,
        windowsHide: true,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        code: null,
        stdout: "",
        stderr: "",
        error: error.message,
        timedOut: false,
        truncated: false,
      });
      return;
    }

    const stdout = [];
    const stderr = [];
    let outputBytes = 0;
    let timedOut = false;
    let truncated = false;
    let spawnError;
    let settled = false;

    function stopProcess() {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    }

    function collect(target, chunk) {
      const remaining = maxOutputBytes - outputBytes;
      if (remaining <= 0) {
        truncated = true;
        stopProcess();
        return;
      }
      const kept = chunk.subarray(0, remaining);
      target.push(kept);
      outputBytes += kept.length;
      if (kept.length < chunk.length) {
        truncated = true;
        stopProcess();
      }
    }

    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.on("error", (error) => {
      spawnError = error.message;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      stopProcess();
    }, timeoutMs);
    timeout.unref?.();

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: spawnError,
        timedOut,
        truncated,
      });
    });
  });
}
