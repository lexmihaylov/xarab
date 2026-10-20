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
  "sed",
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
function isAllowedGitCommand(executable, command) {
  return executable === "git" && !command.toLowerCase().includes("force");
}

function isAllowedPackageManagerCommand(executable) {
  return executable === "npm";
}

function isWorkspaceValidationCommand(executable, tokens) {
  if (!["pnpm", "yarn", "bun"].includes(executable)) return false;
  const script =
    tokens[1]?.toLowerCase() === "run" ? tokens[2]?.toLowerCase() : tokens[1]?.toLowerCase();
  return ["build", "check", "lint", "test", "typecheck"].includes(script);
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

function parseSafeComposition(command) {
  const stages = [];
  let stageStart = 0;
  let quote = null;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index];
    if (quote) {
      if (quote === '"' && (character === "$" || character === "`")) return null;
      if (character === "\\" && quote === '"') {
        index += 1;
        if (index >= command.length) return null;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character === "\\") {
      index += 1;
      if (index >= command.length) return null;
      continue;
    }
    if (character === "&" && command[index + 1] === "&") {
      const stage = command.slice(stageStart, index).trim();
      if (!stage) return null;
      stages.push(stage);
      stageStart = index + 2;
      index += 1;
      continue;
    }
    if (character === "|") {
      if (command[index + 1] === "|") return null;
      const stage = command.slice(stageStart, index).trim();
      if (!stage) return null;
      stages.push(stage);
      stageStart = index + 1;
      continue;
    }
    if (/[;&<>`$(){}\n\r#]/.test(character)) return null;
  }

  if (quote) return null;
  const stage = command.slice(stageStart).trim();
  if (!stage) return null;
  stages.push(stage);
  return stages;
}

function tokenize(command) {
  return command.match(/(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\s]+)/g) ?? [];
}

function assessSimpleShellCommand(command, workspace) {
  const tokens = tokenize(command);
  const executable = (tokens[0] ?? "")
    .replace(/^["']|["']$/g, "")
    .split(/[\\/]/)
    .at(-1)
    ?.toLowerCase();
  if (isAllowedGitCommand(executable, command)) return [];

  const reasons = [];
  if (outsideWorkspaceReference(command, workspace))
    reasons.push("The command may access paths outside the workspace.");

  if (
    /(^|[\s])(?:sudo|doas|su|rm|rmdir|mv|cp|dd|mkfs|wipefs|shred|truncate|chmod|chown|kill|pkill|mkdir|touch|tee)(?:\s|$)/i.test(
      command,
    ) ||
    /\b(pnpm\s+(?:install|add|remove|publish|link)|yarn\s+(?:install|add|remove|publish|link)|pip3?\s+(?:install|uninstall)|docker\s+(?:rm|rmi|system\s+prune|run|exec)|kubectl\s+(?:delete|apply|patch|replace))\b/i.test(
      command,
    ) ||
    /(?:^|[^<])>{1,2}|\btee\b|\bsed\s+-[^\n]*i/.test(command)
  ) {
    reasons.push(
      "The command may modify or delete files, change system state, or perform an external action.",
    );
  }

  const allowlisted =
    READ_ONLY_COMMANDS.has(executable) ||
    isAllowedPackageManagerCommand(executable) ||
    isWorkspaceValidationCommand(executable, tokens) ||
    (executable === "node" && tokens[1]?.toLowerCase() === "--test");
  if (!allowlisted) reasons.push("The command is not a recognized read-only workspace command.");

  return reasons;
}

export function assessShellCommand(command, workspace = process.cwd()) {
  const trimmedCommand = typeof command === "string" ? command.trim() : "";
  if (!trimmedCommand)
    return { requiresApproval: true, reasons: ["The command is empty or invalid."] };

  // This deliberately recognizes only a small shell subset. Unknown syntax must be approved.
  const stages = parseSafeComposition(trimmedCommand);
  if (!stages) {
    return {
      requiresApproval: true,
      reasons: ["The command uses unsupported shell composition or redirection."],
    };
  }

  const root = path.resolve(workspace);
  const reasons = stages.flatMap((stage, index) => {
    const stageReasons = assessSimpleShellCommand(stage, root);
    if (stages.length === 1) return stageReasons;
    return stageReasons.map((reason) => `Command stage ${index + 1} (${stage}): ${reason}`);
  });
  return { requiresApproval: reasons.length > 0, reasons: [...new Set(reasons)] };
}
