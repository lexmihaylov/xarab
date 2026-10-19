import { readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { fuzzyScore } from "./fuzzy-score.js";

const MAX_SCANNED_ENTRIES = 10_000;
const MAX_DEPTH = 8;
const MAX_RESULTS = 30;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);

function isWithinDirectory(directory, target) {
  const relative = path.relative(directory, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export function createSearchFilesTool({ workspace = process.cwd(), onEvent = () => {} } = {}) {
  const rootPath = path.resolve(workspace);

  return {
    description:
      "Fuzzy-search file names and workspace-relative paths. Skips .git and node_modules and returns the best matches.",
    params: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Fuzzy query to match against file names and paths.",
        },
        path: {
          type: "string",
          description:
            "Optional workspace-relative directory to search. Defaults to the workspace root.",
        },
      },
      required: ["query"],
    },
    async handler({ query, path: requestedPath = "." } = {}) {
      if (typeof query !== "string" || query.trim() === "")
        return "Error: provide a non-empty search query.";
      if (typeof requestedPath !== "string") return "Error: directory path must be a string.";

      const normalizedQuery = query.trim().replaceAll("\\", "/");
      const searchDirectory = requestedPath.trim() || ".";
      try {
        const realRoot = await realpath(rootPath);
        const candidate = path.resolve(realRoot, searchDirectory);
        if (!isWithinDirectory(realRoot, candidate)) {
          onEvent({ type: "denied", path: searchDirectory });
          return "Error: search directory is outside the workspace.";
        }
        const directory = await realpath(candidate);
        if (!isWithinDirectory(realRoot, directory)) {
          onEvent({ type: "denied", path: searchDirectory });
          return "Error: search directory resolves outside the workspace.";
        }

        let scanned = 0;
        let truncated = false;
        const matches = [];
        async function visit(currentDirectory, depth) {
          if (scanned >= MAX_SCANNED_ENTRIES || depth > MAX_DEPTH) {
            truncated = true;
            return;
          }
          const entries = await readdir(currentDirectory, { withFileTypes: true });
          entries.sort((left, right) => left.name.localeCompare(right.name));
          for (const entry of entries) {
            if (scanned >= MAX_SCANNED_ENTRIES) {
              truncated = true;
              break;
            }
            scanned += 1;
            if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;

            const fullPath = path.join(currentDirectory, entry.name);
            if (entry.isFile()) {
              const relativePath = path.relative(realRoot, fullPath);
              const score = fuzzyScore(relativePath, normalizedQuery);
              if (score !== null) matches.push({ path: relativePath, score });
            } else if (entry.isDirectory() && depth < MAX_DEPTH) {
              await visit(fullPath, depth + 1);
            } else if (entry.isDirectory()) {
              truncated = true;
            }
          }
        }

        await visit(directory, 0);
        matches.sort(
          (left, right) => left.score - right.score || left.path.localeCompare(right.path),
        );
        const results = matches.slice(0, MAX_RESULTS);
        const displayPath = path.relative(realRoot, directory) || ".";
        const wasTruncated = truncated || matches.length > MAX_RESULTS;
        onEvent({
          type: "searched",
          query: normalizedQuery,
          path: displayPath,
          results: results.length,
          truncated: wasTruncated,
        });
        if (results.length === 0) return `No files matched “${normalizedQuery}” in ${displayPath}.`;
        return `Best file matches for “${normalizedQuery}” in ${displayPath}:${wasTruncated ? " (search/result limit reached)" : ""}\n${results.map(({ path: filePath }) => filePath).join("\n")}`;
      } catch (error) {
        const message = error.code === "ENOENT" ? "Directory does not exist." : error.message;
        onEvent({ type: "error", path: searchDirectory, message });
        return `Error searching files: ${message}`;
      }
    },
  };
}
