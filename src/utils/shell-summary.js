export function shellSummary(summary) {
  return String(summary ?? "")
    .replace(/^Ran command in .*?:\n\n?```[^\n]*\n[\s\S]*?\n```\n?\n?/m, "")
    .replace(/^Exit code: .*\n?\n?/m, "")
    .replace(/^Signal: .*\n?\n?/m, "")
    .replace(/^Command timed out\.\n?\n?/m, "")
    .replace(/^Execution error: .*\n?\n?/m, "")
    .replace(/^Captured output was truncated at 64 KiB\.\n?\n?/m, "")
    .replace(/^stdout:\n\n?/m, "")
    .replace(/^stderr:\n\n?/m, "")
    .replace(/^```[^\n]*\n/gm, "")
    .replace(/\n```(?=\n|$)/g, "")
    .trim();
}
