import assert from "node:assert/strict";
import test from "node:test";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createDiagnosticLog } from "../src/utils/diagnostic-log.js";

test("writes timestamped diagnostics and rotates an oversized log", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "xarab-log-"));
  try {
    const file = path.join(dir, "xarab.log");
    const log = createDiagnosticLog(file);
    await log.append("warning", "possible leak\nperf_hook");
    assert.match(await readFile(file, "utf8"), /\[warning\] possible leak perf_hook/);
    await log.append("warning", "x".repeat(1024 * 1024));
    assert.match(await readFile(`${file}.1`, "utf8"), /possible leak/);
    assert.match(await readFile(file, "utf8"), /\[warning\]/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("logging failures do not reject", async () => {
  const log = createDiagnosticLog(path.join(os.tmpdir(), "nonexistent-xarab-log-parent", "\0"));
  await log.append("warning", "failed");
  await log.flush();
});
