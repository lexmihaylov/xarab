import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TOKEN_BUDGET = 4_096;
const DEFAULT_LINES_PER_READ = 200;
const MAX_LINES_PER_READ = 2_000;
const MAX_READ_BYTES = 50 * 1024;
function isWithinDirectory(directory, target) {
  const relative = path.relative(directory, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function getTokenCount(text, tokenize) {
  if (tokenize) {
    const tokens = tokenize(text);
    if (Array.isArray(tokens)) return tokens.length;
  }
  return Math.ceil(text.length / 4);
}

export function createReadFileTool({
  workspace = process.cwd(),
  onEvent = () => {},
  tokenize,
  getTokenBudget = () => DEFAULT_TOKEN_BUDGET,
} = {}) {
  const rootPath = path.resolve(workspace);

  return {
    description: `Read a UTF-8 workspace file as an exact, unnumbered source excerpt. Provide path; optionally set offset (1-based line number, default 1) and limit (maximum lines, default ${DEFAULT_LINES_PER_READ}). Each call returns at most ${MAX_LINES_PER_READ} lines and 50 KiB. If more content remains, the result gives the next offset to continue. Results are capped to a safe response size.`,
    params: {
      type: "object",
      properties: {
        path: {
          type: "string",
          description: "Path to the UTF-8 text file, relative to the current workspace.",
        },
        offset: {
          type: "integer",
          minimum: 1,
          description:
            "1-based line number to start reading from; defaults to 1. Use the returned next offset to continue.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: MAX_LINES_PER_READ,
          description: `Maximum number of lines to return (1-${MAX_LINES_PER_READ}); defaults to ${DEFAULT_LINES_PER_READ}. The 50 KiB page and safe response-size limit may return fewer lines.`,
        },
      },
      required: ["path"],
    },
    async handler({ path: requestedPath, offset = 1, limit = DEFAULT_LINES_PER_READ } = {}) {
      if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
        return "Error: provide a non-empty file path.";
      }
      if (!Number.isInteger(offset) || offset < 1)
        return "Error: offset must be a positive line number.";
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LINES_PER_READ) {
        return `Error: limit must be an integer from 1 to ${MAX_LINES_PER_READ}.`;
      }
      try {
        const realRoot = await realpath(rootPath);
        const candidate = path.resolve(realRoot, requestedPath);
        if (!isWithinDirectory(realRoot, candidate)) {
          onEvent({ type: "denied", path: requestedPath });
          return "Error: file path is outside the workspace.";
        }

        const target = await realpath(candidate);
        if (!isWithinDirectory(realRoot, target)) {
          onEvent({ type: "denied", path: requestedPath });
          return "Error: file path resolves outside the workspace.";
        }

        const metadata = await stat(target);
        if (!metadata.isFile()) {
          onEvent({ type: "error", path: requestedPath, message: "Path is not a regular file." });
          return "Error: path is not a regular file.";
        }

        const displayPath = path.relative(realRoot, target) || path.basename(target);
        const budget = Math.floor(
          typeof getTokenBudget === "function" ? getTokenBudget() : getTokenBudget,
        );
        if (!Number.isFinite(budget) || budget < 64) {
          return "Error: response-size limit is too small to read this file safely. Try a smaller limit.";
        }

        const content = await readFile(target, "utf8");
        if (content.includes("\0")) {
          onEvent({ type: "error", path: requestedPath, message: "File appears to be binary." });
          return "Error: binary files are not supported by read_file.";
        }

        const sourceLines = content.split(/\r?\n/);
        if (sourceLines.at(-1) === "" && content.endsWith("\n")) sourceLines.pop();
        if (offset > sourceLines.length && sourceLines.length > 0) {
          return `Error: offset ${offset} is past the end of ${displayPath} (${sourceLines.length} lines).`;
        }
        const selected = sourceLines.slice(offset - 1, offset - 1 + limit);
        const visibleLines = [];
        let bytes = 0;
        for (let index = 0; index < selected.length; index += 1) {
          const line = selected[index];
          const nextBytes = Buffer.byteLength(line) + (visibleLines.length ? 1 : 0);
          if (bytes + nextBytes > MAX_READ_BYTES) break;
          visibleLines.push(line);
          bytes += nextBytes;
        }

        if (selected.length > 0 && visibleLines.length === 0) {
          const message = `Line ${offset} of ${displayPath} exceeds the 50 KiB page limit and cannot be returned as an exact excerpt.`;
          onEvent({ type: "error", path: displayPath, message });
          return `Error: ${message}`;
        }

        let truncated = visibleLines.length < sourceLines.length - offset + 1;
        let nextOffset = offset + visibleLines.length;
        const formatResult = (lines, hasMore) => {
          const end = lines.length ? offset + lines.length - 1 : offset - 1;
          const header = `File: ${displayPath}\nLines ${offset}-${end}${hasMore ? " (more available)" : ""}\n`;
          const continuation = hasMore
            ? `\n\nMore content available; continue with offset: ${offset + lines.length}.`
            : "";
          return `${header}${lines.join("\n")}${continuation}`;
        };
        let result = formatResult(visibleLines, truncated);

        while (visibleLines.length > 1 && getTokenCount(result, tokenize) > budget) {
          visibleLines.pop();
          truncated = true;
          nextOffset = offset + visibleLines.length;
          result = formatResult(visibleLines, true);
        }
        if (getTokenCount(result, tokenize) > budget && visibleLines.length === 1) {
          return "Error: exact excerpt exceeds the response-size limit. Try a smaller limit or read a shorter section.";
        }

        onEvent({
          type: "read",
          path: displayPath,
          offset,
          endLine: offset + visibleLines.length - 1,
          nextOffset: truncated ? nextOffset : undefined,
          bytes: Buffer.byteLength(visibleLines.join("\n")),
          truncated,
          tokens: getTokenCount(result, tokenize),
        });
        return result;
      } catch (error) {
        const message = error.code === "ENOENT" ? "File does not exist." : error.message;
        onEvent({ type: "error", path: requestedPath, message });
        return `Error reading file: ${message}`;
      }
    },
  };
}
