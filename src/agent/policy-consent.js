import { readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { parsePolicy } from "./command-policy.js";

// Process-local, shared by parent and delegated registries, never persisted.
const decisions = new Map();
const queues = new WeakMap();
function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const abort = () => reject(new Error("Policy operation cancelled."));
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export async function confirmPolicyAction(requestQuestions, question, signal) {
  return (await requestPolicyDecision(requestQuestions, question, signal)) === true;
}

async function requestPolicyDecision(requestQuestions, question, signal) {
  if (signal?.aborted || !requestQuestions) return undefined;
  const previous = queues.get(requestQuestions) ?? Promise.resolve();
  const pending = previous.then(async () => {
    if (signal?.aborted) return undefined;
    try {
      const result = await requestQuestions(
        [{ id: "workspace_policy", question, type: "single", options: ["Approve", "Deny"] }],
        { signal },
      );
      if (signal?.aborted || result?.cancelled !== false) return undefined;
      const choice = result.answers?.find((answer) => answer.id === "workspace_policy")
        ?.choices?.[0];
      return choice === "Approve" ? true : choice === "Deny" ? false : undefined;
    } catch {
      return undefined;
    }
  });
  queues.set(requestQuestions, pending);
  return abortable(pending, signal);
}
export async function loadApprovedPolicy({
  workspace = process.cwd(),
  requestQuestions,
  signal,
  report = (message) => console.warn(message),
}) {
  if (signal?.aborted) throw new Error("Policy operation cancelled.");
  let text;
  let root;
  try {
    root = await realpath(workspace);
    const file = path.join(root, ".xarab", "command-policy.json");
    const resolved = await realpath(file);
    if (resolved !== file) throw new Error("Policy file must not resolve through symlinks.");
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size > 16 * 1024)
      throw new Error("Policy must be a regular file of at most 16 KiB.");
    text = await readFile(file, "utf8");
    if (Buffer.byteLength(text) > 16 * 1024) throw new Error("Policy exceeds 16 KiB.");
  } catch (error) {
    if (error.code !== "ENOENT") report(`Workspace policy ignored: ${error.message}`);
    return null;
  }
  let policy;
  try {
    policy = parsePolicy(text);
  } catch (error) {
    report(`Malformed workspace policy ignored: ${error.message}`);
    return null;
  }
  const key = JSON.stringify([root, text]);
  if (!decisions.has(key)) {
    const decision = requestPolicyDecision(
      requestQuestions,
      `Activate workspace command/path policy for ${root}? Only approve trusted contents.\n${text}`,
      signal,
    ).then(
      (value) => {
        if (value === undefined && decisions.get(key) === decision) decisions.delete(key);
        return value;
      },
      (error) => {
        if (decisions.get(key) === decision) decisions.delete(key);
        throw error;
      },
    );
    decisions.set(key, decision);
  }
  const approved = await abortable(decisions.get(key), signal);
  return approved === true ? policy : null;
}
