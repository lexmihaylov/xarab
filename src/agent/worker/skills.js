import { readdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SKILL_BYTES = 64 * 1024;

async function exists(directory) {
  try {
    return (await stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function scalar(frontmatter, field) {
  const match = frontmatter.match(new RegExp(`^${field}:\\s*(.*?)\\s*$`, "m"));
  if (!match) return undefined;
  const value = match[1];
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value.includes("#") ? value.split("#")[0].trim() : value;
}

export async function discoverSkills(workspace = process.cwd(), home = os.homedir()) {
  const directories = [];
  let current = path.resolve(workspace);
  while (true) {
    directories.push(path.join(current, ".agents", "skills"));
    if (await exists(path.join(current, ".git"))) break;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  directories.push(path.join(home, ".agents", "skills"));
  const skills = new Map();
  for (const directory of directories) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (
        !entry.isDirectory() ||
        !NAME.test(entry.name) ||
        entry.name.length > 64 ||
        skills.has(entry.name)
      )
        continue;
      const file = path.join(directory, entry.name, "SKILL.md");
      try {
        const resolved = await realpath(file);
        const root = await realpath(path.join(directory, entry.name));
        if (path.dirname(resolved) !== root) continue;
        const info = await stat(resolved);
        if (!info.isFile() || info.size > MAX_SKILL_BYTES) continue;
        const content = await readFile(resolved, "utf8");
        const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
        if (!match) continue;
        const name = scalar(match[1], "name");
        const description = scalar(match[1], "description");
        if (
          name !== entry.name ||
          typeof description !== "string" ||
          !description.trim() ||
          description.length > 1024
        )
          continue;
        skills.set(name, { name, description: description.trim(), file: resolved });
      } catch {
        /* Ignore missing or malformed skill files. */
      }
    }
  }
  return skills;
}
