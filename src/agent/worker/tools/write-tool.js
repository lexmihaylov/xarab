import {
  readWorkspaceText,
  replaceWorkspaceText,
  resolveWorkspaceFile,
} from "../../../utils/workspace-file-utils.js";
import { formatChangePreview } from "../../../utils/change-diff.js";

export function createWriteTool({ workspace = process.cwd(), onEvent = () => {} } = {}) {
  return {
    description:
      "Create a text file or completely replace its contents. Provide path and content. Missing parent directories are created. Use edit for focused changes to an existing file. The tool shows a bounded diff in the UI. Paths must stay within the workspace; symlinks and non-regular-file targets are rejected.",
    params: {
      type: "object",
      properties: {
        path: { type: "string", description: "Workspace-relative path to create or replace." },
        content: { type: "string", description: "The complete new contents of the text file." },
      },
      required: ["path", "content"],
    },
    async handler({ path: requestedPath, content } = {}) {
      if (typeof requestedPath !== "string" || !requestedPath.trim())
        return "Error: provide a non-empty file path.";
      if (typeof content !== "string") return "Error: content must be a string.";

      let displayPath = requestedPath;
      try {
        const targetInfo = await resolveWorkspaceFile(workspace, requestedPath, {
          createParents: true,
        });
        displayPath = targetInfo.displayPath;
        if (content.includes("\0")) return "Error: binary file contents are not supported.";
        let previous = "";
        if (targetInfo.exists) {
          try {
            previous = await readWorkspaceText(targetInfo.target, displayPath);
          } catch {
            // Replacing a non-text file is allowed; show the new text as additions.
          }
        }
        await replaceWorkspaceText(targetInfo.target, content, targetInfo.mode);
        onEvent({
          type: "written",
          path: displayPath,
          bytes: Buffer.byteLength(content),
          created: !targetInfo.exists,
          ...formatChangePreview(displayPath, previous, content),
        });
        return `${targetInfo.exists ? "Wrote" : "Created"} ${displayPath} (${Buffer.byteLength(content)} bytes).`;
      } catch (error) {
        const denied = /outside the workspace|resolves outside the workspace|Symbolic-link/.test(
          error.message,
        );
        onEvent({ type: denied ? "denied" : "error", path: displayPath, message: error.message });
        return `Error writing ${displayPath}: ${error.code === "ENOENT" ? "parent directory could not be created" : error.message}`;
      }
    },
  };
}
