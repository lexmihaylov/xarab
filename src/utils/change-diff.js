import { formatPatch, structuredPatch } from "diff";

const MAX_DIFF_LINES = 100;
const MAX_DIFF_LINE_CHARS = 240;

export function formatChangePreview(filePath, before, after) {
  const patch = structuredPatch(filePath, filePath, before, after, "", "", { context: 2 });
  let remaining = MAX_DIFF_LINES;
  let shortened = false;
  const hunks = [];
  for (const hunk of patch.hunks) {
    if (remaining <= 0) {
      shortened = true;
      break;
    }
    const lines = hunk.lines.slice(0, remaining);
    if (lines.length < hunk.lines.length) shortened = true;
    remaining -= lines.length;
    const clipped = lines.map((line) => {
      if (line.length <= MAX_DIFF_LINE_CHARS) return line;
      shortened = true;
      return `${line.slice(0, MAX_DIFF_LINE_CHARS)} [line shortened]`;
    });
    const oldLines = lines.filter((line) => line[0] === "-" || line[0] === " ").length;
    const newLines = lines.filter((line) => line[0] === "+" || line[0] === " ").length;
    hunks.push({ ...hunk, oldLines, newLines, lines: clipped });
  }
  return {
    diffText: formatPatch({ ...patch, hunks }),
    diffNotice: shortened ? "Preview shortened; only part of the change is shown." : "",
  };
}

export function formatChangeDiff(filePath, before, after) {
  return formatChangePreview(filePath, before, after).diffText;
}
