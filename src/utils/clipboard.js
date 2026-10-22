import { spawn } from "node:child_process";
import os from "node:os";

export function copyToClipboard(
  text,
  { platform = process.platform, env = process.env, spawnImpl = spawn } = {},
) {
  const isWsl = Boolean(env.WSL_DISTRO_NAME || env.WSL_INTEROP || /microsoft/i.test(os.release()));
  const candidates = isWsl
    ? [["clip.exe", []]]
    : platform === "darwin"
      ? [["pbcopy", []]]
      : platform === "win32"
        ? [["clip.exe", []]]
        : [
            ["wl-copy", []],
            ["xclip", ["-selection", "clipboard"]],
            ["xsel", ["--clipboard", "--input"]],
          ];

  return copyWithFirstAvailable(candidates, text, spawnImpl);
}

async function copyWithFirstAvailable(candidates, text, spawnImpl) {
  for (const [command, args] of candidates) {
    const copied = await new Promise((resolve) => {
      let settled = false;
      const finish = (success) => {
        if (settled) return;
        settled = true;
        resolve(success);
      };
      try {
        const child = spawnImpl(command, args, { stdio: ["pipe", "ignore", "ignore"] });
        child.once("error", () => finish(false));
        child.once("close", (code) => finish(code === 0));
        child.stdin.end(text);
      } catch {
        finish(false);
      }
    });
    if (copied) return true;
  }
  return false;
}
