import { readFile, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { fuzzyScore } from "../../../utils/fuzzy-score.js";

const MAX_FILES = 500;
const MAX_DIRECTORY_ENTRIES = 10_000;
const MAX_DEPTH = 6;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_TOTAL_BYTES = 16 * 1024 * 1024;
const MAX_RESULTS = 30;
const DEFAULT_RESULTS = 10;
const MAX_LINE_CHARS = 320;
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);

function isWithinDirectory(directory, target) {
  const relative = path.relative(directory, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export function createSearchContentTool({ workspace = process.cwd(), onEvent = () => {} } = {}) {
  const rootPath = path.resolve(workspace);

  return {
    description:
      "Fuzzy-search text file contents line by line within the workspace. Choose the narrowest relevant directory or specific text file. Use a distinctive 2-3 word phrase unique to the target location; avoid single words or common terms. Returns ranked file and line matches; skips .git, node_modules, binary, and oversized files.",
    params: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "A distinctive 2-3 word phrase to fuzzy-match against file lines. Avoid single words and common terms.",
        },
        path: {
          type: "string",
          description:
            "Optional workspace-relative directory or text file to search. Defaults to the workspace root.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_RESULTS,
          description: `Maximum matches to return (1-${MAX_RESULTS}); defaults to ${DEFAULT_RESULTS}.`,
        },
      },
      required: ["query"],
    },
    async handler({ query, path: requestedPath = ".", limit = DEFAULT_RESULTS } = {}) {
      if (typeof query !== "string" || query.trim().length < 2) {
        return "Error: provide a search query with at least two characters.";
      }
      if (typeof requestedPath !== "string") return "Error: search path must be a string.";
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RESULTS)
        return `Error: limit must be an integer from 1 to ${MAX_RESULTS}.`;

      const normalizedQuery = query.trim().replace(/\s+/g, " ");
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
        const targetStats = await stat(directory);
        if (!targetStats.isDirectory() && !targetStats.isFile())
          return "Error: search path must be a directory or text file.";

        let filesScanned = 0;
        let entriesScanned = 0;
        let bytesRead = 0;
        let truncated = false;
        const matches = [];

        async function scanFile(fullPath) {
          if (filesScanned >= MAX_FILES || bytesRead >= MAX_TOTAL_BYTES) {
            truncated = true;
            return;
          }
          filesScanned += 1;
          let buffer;
          try {
            const metadata = await stat(fullPath);
            if (metadata.size > MAX_FILE_BYTES || bytesRead + metadata.size > MAX_TOTAL_BYTES)
              return;
            buffer = await readFile(fullPath);
          } catch {
            return;
          }
          if (
            buffer.length > MAX_FILE_BYTES ||
            bytesRead + buffer.length > MAX_TOTAL_BYTES ||
            buffer.includes(0)
          )
            return;
          bytesRead += buffer.length;

          let content;
          try {
            content = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
          } catch {
            return;
          }

          const lines = content.split(/\r?\n/);
          let bestMatch;
          for (let index = 0; index < lines.length; index += 1) {
            const line = lines[index].trim();
            if (!line) continue;
            const score = fuzzyScore(line, normalizedQuery);
            if (score !== null && (!bestMatch || score < bestMatch.score)) {
              bestMatch = { line: lines[index], lineNumber: index + 1, score };
            }
          }
          if (bestMatch) matches.push({ path: path.relative(realRoot, fullPath), ...bestMatch });
        }

        async function visit(currentDirectory, depth) {
          if (
            filesScanned >= MAX_FILES ||
            entriesScanned >= MAX_DIRECTORY_ENTRIES ||
            depth > MAX_DEPTH
          ) {
            truncated = true;
            return;
          }
          let entries;
          try {
            entries = await readdir(currentDirectory, { withFileTypes: true });
          } catch {
            return;
          }
          entries.sort((left, right) => left.name.localeCompare(right.name));
          for (const entry of entries) {
            if (
              filesScanned >= MAX_FILES ||
              entriesScanned >= MAX_DIRECTORY_ENTRIES ||
              bytesRead >= MAX_TOTAL_BYTES
            ) {
              truncated = true;
              break;
            }
            entriesScanned += 1;
            if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
            const fullPath = path.join(currentDirectory, entry.name);
            if (entry.isDirectory()) {
              if (depth < MAX_DEPTH) await visit(fullPath, depth + 1);
              else truncated = true;
              continue;
            }
            if (entry.isFile()) await scanFile(fullPath);
          }
        }

        if (targetStats.isFile()) await scanFile(directory);
        else await visit(directory, 0);
        matches.sort(
          (left, right) =>
            left.score - right.score ||
            left.path.localeCompare(right.path) ||
            left.lineNumber - right.lineNumber,
        );
        const results = matches.slice(0, limit);
        const displayPath = path.relative(realRoot, directory) || ".";
        const wasTruncated = truncated || matches.length > limit;
        onEvent({
          type: "searched",
          query: normalizedQuery,
          path: displayPath,
          files: filesScanned,
          results: results.length,
          truncated: wasTruncated,
        });
        if (results.length === 0)
          return `No content matched “${normalizedQuery}” in ${displayPath}.${wasTruncated ? " Search limit reached; results may be incomplete." : ""}`;

        const formatted = results.map(({ path: filePath, lineNumber, line }) => {
          const visibleLine =
            line.length > MAX_LINE_CHARS ? `${line.slice(0, MAX_LINE_CHARS)}…` : line;
          return `${filePath}:${lineNumber}: ${visibleLine}`;
        });
        return `Best content matches for “${normalizedQuery}” in ${displayPath}:${wasTruncated ? " (search/result limit reached)" : ""}\n${formatted.join("\n")}`;
      } catch (error) {
        const message = error.code === "ENOENT" ? "Directory does not exist." : error.message;
        onEvent({ type: "error", path: searchDirectory, message });
        return `Error searching file contents: ${message}`;
      }
    },
  };
}
