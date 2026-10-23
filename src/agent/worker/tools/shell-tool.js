import { runShellCommand } from "./shell-command-executor.js";

const MAX_AGENT_OUTPUT_BYTES = 64 * 1024;
const MAX_MODEL_OUTPUT_BYTES = 8 * 1024;
const COMMAND_TIMEOUT_MS = 30_000;

export function createShellTool({ workspace = process.cwd(), onEvent = () => {} } = {}) {
  const root = workspace;

  return {
    description:
      "Run workspace commands, especially tests, builds, lint, package scripts, and Git inspection. Use this for command-line work rather than guessing results. Execution is time- and output-bounded.",
    params: {
      type: "object",
      properties: {
        command: {
          type: "string",
          description: "The shell command to execute from the workspace root.",
        },
      },
      required: ["command"],
    },
    async handler({ command } = {}) {
      if (typeof command !== "string" || !command.trim())
        return "Error: provide a non-empty shell command.";

      onEvent({ type: "started", command });
      const result = await runShellCommand(command, {
        cwd: root,
        timeoutMs: COMMAND_TIMEOUT_MS,
        maxOutputBytes: MAX_AGENT_OUTPUT_BYTES,
      });
      onEvent({ type: "completed", command, ...result });
      return formatCommandResult(result);
    },
  };
}

function formatCommandOutput(output, label, maxBytes) {
  if (!output) return "";
  if (Buffer.byteLength(output) <= maxBytes) return `${label}:\n${output}`;

  const lines = output.split(/\r?\n/);
  const important = [];
  const importantPattern =
    /\b(error|failed|failure|exception|traceback|warning|passed|tests?\s+\d+|suites?\s+\d+|build successful|built successfully|not ok)\b/i;
  for (let index = 0; index < lines.length; index += 1) {
    if (importantPattern.test(lines[index])) important.push(index);
  }
  const selected = new Set([
    ...lines.slice(0, 4).map((_, index) => index),
    ...important.slice(-16),
    ...lines.slice(-10).map((_, index) => lines.length - Math.min(10, lines.length) + index),
  ]);
  const omitted = lines.length - selected.size;
  const header = `${label} excerpt (${lines.length} lines; ${omitted} omitted):`;
  let result = header;
  for (const index of [...selected].sort((left, right) => left - right)) {
    const line = lines[index].length > 500 ? `${lines[index].slice(0, 500)}…` : lines[index];
    const candidate = `${result}\n${line}`;
    if (Buffer.byteLength(candidate) > maxBytes) break;
    result = candidate;
  }
  if (result === header)
    result = `${header}\n${Buffer.from(output)
      .subarray(0, maxBytes - Buffer.byteLength(header) - 1)
      .toString("utf8")}…`;
  return result;
}

function formatCommandResult({ code, signal, stdout, stderr, error, timedOut, truncated }) {
  const lines = [`Exit code: ${code ?? "unknown"}`];
  if (signal) lines.push(`Signal: ${signal}`);
  if (timedOut) lines.push("Command timed out.");
  if (truncated) lines.push("Captured output was truncated at 64 KiB.");
  if (error) lines.push(`Execution error: ${error}`);
  const streamBudget = Math.floor((MAX_MODEL_OUTPUT_BYTES - 256) / 2);
  const stdoutExcerpt = formatCommandOutput(stdout, "stdout", streamBudget);
  const stderrExcerpt = formatCommandOutput(stderr, "stderr", streamBudget);
  if (stdoutExcerpt) lines.push(stdoutExcerpt);
  if (stderrExcerpt) lines.push(stderrExcerpt);
  return lines.join("\n\n");
}
