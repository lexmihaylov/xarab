import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function getGitBranch(workspace) {
  if (!workspace) return null;
  const options = { cwd: workspace, timeout: 3000, maxBuffer: 4096, windowsHide: true };
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["symbolic-ref", "--quiet", "--short", "HEAD"],
      options,
    );
    return stdout.trim() || null;
  } catch {
    try {
      const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], options);
      return stdout.trim() || null;
    } catch {
      return null;
    }
  }
}
