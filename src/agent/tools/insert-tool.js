import {
  findText,
  readWorkspaceText,
  replaceWorkspaceText,
  resolveWorkspaceFile,
} from "../../utils/workspace-file-utils.js";
import { formatChangeDiff } from "../../utils/change-diff.js";

export function createInsertTool({ workspace = process.cwd(), onEvent = () => {}, position }) {
  if (position !== "before" && position !== "after")
    throw new Error("position must be before or after");
  const name = position === "before" ? "insert_before" : "insert_after";
  const direction = position === "before" ? "before" : "after";

  return {
    description: `Insert text ${direction} an exact anchor in an existing workspace file. Provide path, anchor, and content. The anchor must match exactly once: read the file first, copy it exactly (including tabs, spaces, and trailing whitespace), and include 2-3 distinctive surrounding lines. For anchors at a line boundary, the tool adds a missing newline between inserted content and the anchor; use explicit newlines for inline insertions. Generic tags such as </div>, </span>, and </p> are usually not unique. Verify the anchor is unique before inserting. The tool shows a bounded diff in the UI. Paths must stay within the workspace; symlinks and non-text files are rejected.`,
    params: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path to the existing text file." },
        anchor: {
          type: "string",
          description:
            "Exact non-empty text to insert relative to. Copy it exactly, include 2-3 unique surrounding lines, and ensure it occurs exactly once.",
        },
        content: { type: "string", description: `Text to insert ${direction} the anchor.` },
      },
      required: ["path", "anchor", "content"],
    },
    async handler({ path: requestedPath, anchor, content } = {}) {
      if (typeof requestedPath !== "string" || !requestedPath.trim())
        return "Error: provide a non-empty file path.";
      if (typeof anchor !== "string" || !anchor) return "Error: anchor must be a non-empty string.";
      if (typeof content !== "string" || !content)
        return "Error: content must be a non-empty string.";
      if (anchor.includes("\0") || content.includes("\0"))
        return "Error: binary text is not supported.";

      let displayPath = requestedPath;
      try {
        const targetInfo = await resolveWorkspaceFile(workspace, requestedPath);
        displayPath = targetInfo.displayPath;
        if (!targetInfo.exists) return `Error: file does not exist: ${displayPath}.`;
        const original = await readWorkspaceText(targetInfo.target, displayPath);
        const matches = [];
        let searchFrom = 0;
        while (searchFrom <= original.length) {
          const match = findText(original.slice(searchFrom), anchor);
          if (!match) break;
          matches.push({ index: searchFrom + match.index, length: match.length });
          searchFrom += match.index + Math.max(match.length, 1);
        }
        const occurrences = matches.length;
        if (occurrences === 0)
          return `Error: anchor was not found in ${displayPath}; reread the file and copy the exact text.`;
        if (occurrences !== 1) {
          return `Error: anchor must match exactly once in ${displayPath} (found ${occurrences}); include more surrounding text.`;
        }

        const match = matches[0];
        const insertionPoint = position === "before" ? match.index : match.index + match.length;
        const newline = original.includes("\r\n") ? "\r\n" : "\n";
        let inserted = content;
        if (
          position === "before" &&
          (match.index === 0 || /\r?\n$/.test(original.slice(0, match.index)))
        ) {
          if (!inserted.endsWith("\n")) inserted += newline;
        } else if (
          position === "after" &&
          (insertionPoint === original.length || /^\r?\n/.test(original.slice(insertionPoint)))
        ) {
          if (!inserted.startsWith("\n")) inserted = `${newline}${inserted}`;
        }
        const updated = `${original.slice(0, insertionPoint)}${inserted}${original.slice(insertionPoint)}`;
        await replaceWorkspaceText(targetInfo.target, updated, targetInfo.mode);
        onEvent({
          type: "edited",
          path: displayPath,
          action: `Inserted ${direction}`,
          replacements: 1,
          diffText: formatChangeDiff(displayPath, original, updated),
        });
        return `Inserted ${direction} anchor in ${displayPath}.`;
      } catch (error) {
        const denied = /outside the workspace|resolves outside the workspace|Symbolic-link/.test(
          error.message,
        );
        onEvent({ type: denied ? "denied" : "error", path: displayPath, message: error.message });
        return `Error ${name} ${displayPath}: ${error.code === "ENOENT" ? "file or parent directory does not exist" : error.message}`;
      }
    },
  };
}
