import path from "node:path";

const READ_ONLY_COMMANDS = new Set([
  "basename",
  "cat",
  "cmp",
  "date",
  "diff",
  "dirname",
  "du",
  "file",
  "find",
  "grep",
  "head",
  "ls",
  "pwd",
  "rg",
  "sort",
  "stat",
  "tail",
  "tr",
  "true",
  "uname",
  "uniq",
  "wc",
  "which",
  "whoami",
  "false",
]);
const READ_ONLY_GIT_COMMANDS = new Set([
  "branch",
  "diff",
  "log",
  "ls-files",
  "remote",
  "rev-parse",
  "show",
  "status",
]);
const WORKSPACE_VALIDATION_SCRIPTS = new Set(["build", "check", "lint", "test", "typecheck"]);

function isWorkspaceValidationCommand(executable, tokens) {
  if (!["npm", "pnpm", "yarn", "bun"].includes(executable)) return false;
  const script =
    tokens[1]?.toLowerCase() === "run" ? tokens[2]?.toLowerCase() : tokens[1]?.toLowerCase();
  return WORKSPACE_VALIDATION_SCRIPTS.has(script);
}

function isWithinWorkspace(workspace, candidate) {
  const relative = path.relative(workspace, candidate);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

function outsideWorkspaceReference(command, workspace) {
  if (/(^|[\s="'])~(?:[/\\]|$)|\$\{?HOME\}?|%USERPROFILE%/i.test(command)) return true;
  if (/(^|[\s="'])\.\.(?:[/\\]|$)/.test(command)) return true;

  const absolutePaths =
    command.match(
      /(?:^|[\s=:"'])((?:\/(?:[^\s"'`;&|<>]+)?|[A-Za-z]:[\\/][^\s"'`;&|<>]+|\\\\[^\s"'`;&|<>]+))/g,
    ) ?? [];
  return absolutePaths.some((match) => {
    const candidatePath = match.trim().replace(/^[\s=:"']+|["',]+$/g, "");
    if (!candidatePath || candidatePath === "/") return true;
    if (candidatePath.startsWith("/"))
      return !isWithinWorkspace(workspace, path.resolve(candidatePath));
    return true;
  });
}

export function assessShellCommand(command, workspace = process.cwd()) {
  const reasons = [];
  const trimmedCommand = typeof command === "string" ? command.trim() : "";
  if (!trimmedCommand)
    return { requiresApproval: true, reasons: ["The command is empty or invalid."] };

  const root = path.resolve(workspace);
  if (outsideWorkspaceReference(trimmedCommand, root))
    reasons.push("The command may access paths outside the workspace.");

  if (
    /(^|[\s;&|])(?:sudo|doas|su|rm|rmdir|mv|cp|dd|mkfs|wipefs|shred|truncate|chmod|chown|kill|pkill|mkdir|touch|tee|install)(?:\s|$)/i.test(
      trimmedCommand,
    ) ||
    /\b(git\s+(?:reset|clean|checkout|restore|push|commit|merge|rebase|cherry-pick|tag)|npm\s+(?:install|uninstall| ci|publish|link)|pnpm\s+(?:install|add|remove|publish|link)|yarn\s+(?:install|add|remove|publish|link)|pip3?\s+(?:install|uninstall)|docker\s+(?:rm|rmi|system\s+prune|run|exec)|kubectl\s+(?:delete|apply|patch|replace))\b/i.test(
      trimmedCommand,
    ) ||
    /(?:^|[^<])>{1,2}|\btee\b|\bsed\s+-[^\n]*i/.test(trimmedCommand)
  ) {
    reasons.push(
      "The command may modify or delete files, change system state, or perform an external action.",
    );
  }

  if (/[;&|<>`\n\r]|\$\(/.test(trimmedCommand))
    reasons.push(
      "The command uses shell composition or redirection, so its effects are ambiguous.",
    );

  const tokens = trimmedCommand.match(/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g) ?? [];
  const executable = (tokens[0] ?? "")
    .replace(/^["']|["']$/g, "")
    .split(/[\\/]/)
    .at(-1)
    ?.toLowerCase();
  const gitSubcommand = executable === "git" ? tokens[1]?.toLowerCase() : null;
  const allowlisted =
    READ_ONLY_COMMANDS.has(executable) ||
    (executable === "git" && READ_ONLY_GIT_COMMANDS.has(gitSubcommand)) ||
    isWorkspaceValidationCommand(executable, tokens) ||
    (executable === "node" && tokens[1]?.toLowerCase() === "--test");
  if (!allowlisted) reasons.push("The command is not a recognized read-only workspace command.");

  return { requiresApproval: reasons.length > 0, reasons: [...new Set(reasons)] };
}
