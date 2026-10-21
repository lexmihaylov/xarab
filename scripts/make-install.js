import { lstat, mkdir, symlink, unlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const checkoutRoot = path.dirname(scriptDirectory);
const binaryPath = path.join(checkoutRoot, "bin", "xarab.js");
const installDirectory = path.join(os.homedir(), ".local", "bin");
const linkPath = path.join(installDirectory, "xarab");

await mkdir(installDirectory, { recursive: true });

try {
  const existing = await lstat(linkPath);
  if (existing.isDirectory()) {
    throw new Error(`${linkPath} is a directory`);
  }
  await unlink(linkPath);
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

await symlink(binaryPath, linkPath);
console.log(`Linked ${linkPath} -> ${binaryPath}`);
