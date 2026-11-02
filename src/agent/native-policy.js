import path from "node:path";
import { realpath } from "node:fs/promises";
import { pathAction, strictest } from "./command-policy.js";
import { confirmPolicyAction } from "./policy-consent.js";

const covered = new Set([
  "read_file",
  "list_files",
  "search_files",
  "search_content",
  "edit",
  "write",
  "insert_before",
  "insert_after",
  "analyze_image",
  "edit_image",
  "generate_image",
]);
export const isPolicyTool = (name) => covered.has(name);

// Resolve existing ancestors too, so new files under a symlink cannot evade rules.
async function resolveTarget(target) {
  try {
    return await realpath(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const parent = path.dirname(target);
    if (parent === target) throw error;
    return path.join(await resolveTarget(parent), path.basename(target));
  }
}

export async function authorizeNativeTool({
  policy,
  workspace,
  name,
  params = {},
  requestQuestions,
  signal,
}) {
  if (signal?.aborted) return false;
  if (!policy) return true;
  const root = await realpath(workspace);
  const targets = [];
  if (["generate_image", "edit_image"].includes(name)) {
    if (typeof params.folder === "string") targets.push([params.folder, true]);
  }
  if (name !== "generate_image") {
    const descendants = ["list_files", "search_files", "search_content"].includes(name);
    if (typeof params.path === "string" || descendants)
      targets.push([descendants ? params.path?.trim() || "." : params.path, descendants]);
  }
  const actions = [];
  for (const [target, descendants] of targets) {
    const absolute = path.resolve(workspace, target);
    actions.push(pathAction(policy, path.resolve(workspace), absolute, descendants));
    actions.push(pathAction(policy, root, await resolveTarget(absolute), descendants));
  }
  const action = strictest(actions);
  if (action === "deny") return false;
  if (action === "verify")
    return confirmPolicyAction(
      requestQuestions,
      `Allow ${name} access under workspace policy?\n${JSON.stringify(targets)}`,
      signal,
    );
  return !signal?.aborted;
}
