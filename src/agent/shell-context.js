const MAX_CONTEXT_CHARS = 64 * 1024;
const MAX_COMMAND_CHARS = 4 * 1024;
const MAX_STREAM_CHARS = 24 * 1024;

function codeFence(text) {
  let longest = 2;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = "`".repeat(longest + 1);
  return `${fence}text\n${text || "(no output)"}\n${fence}`;
}

export function formatShellResult(command, result, workspace) {
  const state = result.timedOut
    ? "timed out"
    : result.error
      ? `failed to start: ${result.error}`
      : `exit code ${result.code}`;
  const sections = [`Ran command in ${workspace} (${state}):`, codeFence(command)];
  if (result.stdout) sections.push(`stdout:\n${codeFence(result.stdout)}`);
  if (result.stderr) sections.push(`stderr:\n${codeFence(result.stderr)}`);
  if (!result.stdout && !result.stderr) sections.push("No output.");
  if (result.truncated) sections.push("Output was truncated at 64 KiB.");
  return sections.join("\n\n");
}

export function createShellContextEntry(command, result) {
  return {
    command: command.slice(0, MAX_COMMAND_CHARS),
    exitCode: result.code,
    signal: result.signal,
    stdout: result.stdout.slice(0, MAX_STREAM_CHARS),
    stderr: result.stderr.slice(0, MAX_STREAM_CHARS),
    error: result.error,
    timedOut: result.timedOut,
    truncated:
      result.truncated ||
      command.length > MAX_COMMAND_CHARS ||
      result.stdout.length > MAX_STREAM_CHARS ||
      result.stderr.length > MAX_STREAM_CHARS,
  };
}

export function appendShellContext(entries, entry) {
  const next = [...entries, entry];
  while (next.length > 1 && JSON.stringify(next).length > MAX_CONTEXT_CHARS) next.shift();
  return next;
}
