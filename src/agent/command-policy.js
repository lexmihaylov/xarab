import path from "node:path";

const ranks = { allow: 1, verify: 2, deny: 3 };
export function strictest(...actions) {
  return actions
    .flat()
    .reduce((best, action) => (ranks[action] > (ranks[best] || 0) ? action : best), undefined);
}
export function parsePolicy(text) {
  const value = JSON.parse(text);
  if (
    !value ||
    value.version !== 1 ||
    Object.keys(value).some((key) => !["version", "commands", "files", "folders"].includes(key))
  )
    throw new Error("Expected command policy version 1.");
  for (const kind of ["commands", "files", "folders"]) {
    value[kind] ??= {};
    if (!value[kind] || Array.isArray(value[kind]) || typeof value[kind] !== "object")
      throw new Error(`Invalid ${kind} rules.`);
    for (const [name, action] of Object.entries(value[kind])) {
      if (
        !Object.hasOwn(ranks, action) ||
        !name ||
        (kind === "commands"
          ? !/^[a-zA-Z0-9_.+-]+$/.test(name)
          : path.posix.isAbsolute(name) ||
            name.includes("\\") ||
            name.split("/").includes("..") ||
            path.posix.normalize(name) !== name)
      )
        throw new Error(`Invalid ${kind} rule: ${name}`);
    }
  }
  return value;
}
export function pathAction(policy, workspace, target, descendants = false) {
  const relative =
    path.relative(workspace, path.resolve(workspace, target)).split(path.sep).join("/") || ".";
  if (relative === ".." || relative.startsWith("../")) return undefined;
  const below = (child, parent) =>
    parent === "." || child === parent || child.startsWith(`${parent}/`);
  return strictest(
    Object.entries(policy.files)
      .filter(([name]) => name === relative || (descendants && below(name, relative)))
      .map(([, action]) => action),
    Object.entries(policy.folders)
      .filter(([name]) => below(relative, name) || (descendants && below(name, relative)))
      .map(([, action]) => action),
  );
}
// Bounded shell lexing, not shell evaluation. Unsupported syntax always falls back.
function shellGroups(command) {
  if (command.length > 65536) return { groups: [], complex: true };
  const groups = [];
  let tokens = [];
  let word = "";
  let started = false;
  let quote = "";
  let complex = false;
  let start = 0;
  let count = 0;
  let redirect = false;
  const flush = () => {
    if (!started) return;
    tokens.push({ value: word, redirect });
    count++;
    redirect = false;
    word = "";
    started = false;
  };
  const group = (end) => {
    flush();
    const text = command.slice(start, end).trim();
    if (text) groups.push({ text, tokens });
    else complex = true;
    tokens = [];
  };
  for (let i = 0; i < command.length; i++) {
    if (count >= 4096) return { groups: [], complex: true };
    const char = command[i];
    if (quote) {
      if (char === quote) quote = "";
      else {
        if (quote === '"' && /[$`\\\\]/.test(char)) complex = true;
        if (char === "\\" && quote === '"' && i + 1 < command.length) {
          word += command[++i];
        } else word += char;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      started = true;
    } else if (char === "\\") {
      complex = true;
      started = true;
      if (i + 1 < command.length) word += command[++i];
    } else if (char === "#" && !started) {
      complex = true;
      // Do not interpret comment text as commands or paths.
      while (i < command.length && command[i] !== "\n") i++;
      group(i);
      start = i + 1;
    } else if (/[;&|\n]/.test(char)) {
      if (char === "\n" || (char === "&" && command[i + 1] !== "&")) complex = true;
      group(i);
      if (command[i + 1] === char && /[&|]/.test(char)) i++;
      start = i + 1;
    } else if (char === "<" || char === ">") {
      complex = true;
      flush();
      redirect = true;
      while (command[i + 1] === char) i++;
    } else if (/\s/.test(char)) flush();
    else {
      if (/[*?\[\]$`(){}~]/.test(char)) complex = true;
      word += char;
      started = true;
    }
  }
  if (quote || redirect) complex = true;
  group(command.length);
  return { groups, complex };
}

// Deliberately conservative: only plain argv groups qualify for model bypass.
export function commandActions(policy, workspace, command) {
  const parsed = shellGroups(command);
  const { groups } = parsed;
  const complex =
    parsed.complex ||
    groups.some(({ tokens }) =>
      /^(?:if|then|else|elif|fi|for|while|until|do|done|case|esac|in|function|select|time|!)$/.test(
        tokens[0]?.value || "",
      ),
    );
  const unmatched = [];
  const actions = [];
  for (const group of groups) {
    const plain = group.tokens.filter((token) => !token.redirect).map((token) => token.value);
    const base = plain[0];
    const commandAction = /^[a-zA-Z0-9_.+-]+$/.test(base || "") ? policy.commands[base] : undefined;
    actions.push(commandAction);
    for (const token of [
      ...plain.slice(1),
      ...group.tokens.filter((token) => token.redirect).map((token) => token.value),
    ]) {
      const candidate =
        token.startsWith("-") && token.includes("=") ? token.slice(token.indexOf("=") + 1) : token;
      actions.push(pathAction(policy, workspace, candidate));
    }
    if (!commandAction || complex) unmatched.push(group.text);
  }
  if (!groups.length || complex) return { action: strictest(actions), unmatched: [command] };
  return { action: strictest(actions), unmatched };
}
