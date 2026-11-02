import { spawn } from "node:child_process";

export function runShellCommand(
  command,
  { cwd = process.cwd(), timeoutMs = 30_000, maxOutputBytes = 64 * 1024, signal } = {},
) {
  const abortSignal = signal;
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve({ code: null, stdout: "", stderr: "", error: "Command cancelled.", cancelled: true });
      return;
    }
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

    let killTimer;
    function cancel() {
      stopProcess();
      killTimer ??= setTimeout(() => {
        try {
          if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {
          // The process may already have exited.
        }
      }, 1000);
      killTimer.unref?.();
    }
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted) cancel();

    function collect(target, chunk) {
      const remaining = maxOutputBytes - outputBytes;
      if (remaining <= 0) {
        truncated = true;
        cancel();
        return;
      }
      const kept = chunk.subarray(0, remaining);
      target.push(kept);
      outputBytes += kept.length;
      if (kept.length < chunk.length) {
        truncated = true;
        cancel();
      }
    }

    child.stdout.on("data", (chunk) => collect(stdout, chunk));
    child.stderr.on("data", (chunk) => collect(stderr, chunk));
    child.on("error", (error) => {
      spawnError = error.message;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      cancel();
    }, timeoutMs);
    timeout.unref?.();

    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTimeout(killTimer);
      // The close event's signal is distinct from the caller's AbortSignal.
      abortSignal?.removeEventListener("abort", cancel);
      resolve({
        code,
        signal,
        cancelled: abortSignal?.aborted ?? false,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        error: spawnError,
        timedOut,
        truncated,
      });
    });
  });
}
