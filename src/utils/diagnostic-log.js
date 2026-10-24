import { mkdir, open, rename, stat } from "node:fs/promises";
import path from "node:path";

const MAX_BYTES = 1024 * 1024;

export function createDiagnosticLog(filePath) {
  let pending = Promise.resolve();
  async function append(kind, detail) {
    const entry = `${new Date().toISOString()} [${kind}] ${String(detail).replace(/[\r\n]+/g, " ")}\n`;
    pending = pending.then(async () => {
      try {
        await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
        const size = (await stat(filePath).catch(() => null))?.size ?? 0;
        if (size + Buffer.byteLength(entry) > MAX_BYTES) await rename(filePath, `${filePath}.1`);
        const handle = await open(filePath, "a", 0o600);
        try {
          await handle.writeFile(entry);
        } finally {
          await handle.close();
        }
      } catch {
        // Diagnostics must not prevent the application from running.
      }
    });
    return pending;
  }
  return { append, flush: () => pending };
}
