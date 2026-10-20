import { createPatch } from "diff";

const MAX_DIFF_LINES = 100;
const MAX_DIFF_LINE_CHARS = 240;

export function formatChangeDiff(filePath, before, after) {
  const lines = createPatch(filePath, before, after, "", "", { context: 2 }).split("\n");
  const clippedLines = lines
    .slice(0, MAX_DIFF_LINES)
    .map((line) =>
      line.length > MAX_DIFF_LINE_CHARS
        ? `${line.slice(0, MAX_DIFF_LINE_CHARS)}… [line shortened]`
        : line,
    );
  if (lines.length > MAX_DIFF_LINES)
    clippedLines.push(`… diff shortened; ${lines.length - MAX_DIFF_LINES} lines omitted …`);
  return clippedLines.join("\n");
}
