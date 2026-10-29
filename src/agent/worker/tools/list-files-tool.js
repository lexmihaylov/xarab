import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const MAX_ENTRIES = 300;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);

function isWithinDirectory(directory, target) {
  const relative = path.relative(directory, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export function createListFilesTool({ workspace = process.cwd(), onEvent = () => {} } = {}) {
  const rootPath = path.resolve(workspace);

  return {
    description:
      "List immediate entries in a workspace directory, without recursion. List relevant subdirectories separately or use search_files to locate paths. Results skip .git and node_modules and are bounded to 300 entries.",
    params: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Workspace-relative directory to list. Defaults to the workspace root.",
        },
      },
    },
    async handler({ path: requestedPath = ".", ...options } = {}) {
      if (Object.hasOwn(options, "recursive"))
        return "Error: recursive listing is unavailable; list relevant directories separately.";
      if (typeof requestedPath !== "string") return "Error: directory path must be a string.";
      const searchDirectory = requestedPath.trim() || ".";

      try {
        const realRoot = await realpath(rootPath);
        const candidate = path.resolve(realRoot, searchDirectory);
        if (!isWithinDirectory(realRoot, candidate)) {
          onEvent({ type: "denied", path: searchDirectory });
          return "Error: directory path is outside the workspace.";
        }

        const directory = await realpath(candidate);
        if (!isWithinDirectory(realRoot, directory)) {
          onEvent({ type: "denied", path: searchDirectory });
          return "Error: directory path resolves outside the workspace.";
        }
        if (!(await stat(directory)).isDirectory()) {
          onEvent({ type: "error", path: searchDirectory, message: "Path is not a directory." });
          return "Error: path is not a directory.";
        }

        const results = [];
        let truncated = false;
        const entries = await readdir(directory, { withFileTypes: true });
        entries.sort((left, right) => left.name.localeCompare(right.name));
        for (const entry of entries) {
          if (results.length >= MAX_ENTRIES) {
            truncated = true;
            break;
          }
          if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

          const fullPath = path.join(directory, entry.name);
          const relativePath = path.relative(realRoot, fullPath) || entry.name;
          const isDirectory = entry.isDirectory();
          const isSymlink = entry.isSymbolicLink();
          results.push(`${relativePath}${isDirectory ? "/" : isSymlink ? "@" : ""}`);
        }
        const displayPath = path.relative(realRoot, directory) || ".";
        onEvent({ type: "listed", path: displayPath, entries: results.length, truncated });
        if (results.length === 0) return `No files found in ${displayPath}.`;
        return `Files in ${displayPath}:${truncated ? ` (showing at most ${MAX_ENTRIES} entries)` : ""}\n${results.join("\n")}`;
      } catch (error) {
        const message = error.code === "ENOENT" ? "Directory does not exist." : error.message;
        onEvent({ type: "error", path: searchDirectory, message });
        return `Error listing directory: ${message}`;
      }
    },
  };
}
