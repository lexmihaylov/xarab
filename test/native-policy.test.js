import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { authorizeNativeTool } from "../src/agent/native-policy.js";
import { parsePolicy } from "../src/agent/command-policy.js";
import { authorizeCommand } from "../src/agent/command-risk.js";
import { createToolRegistry } from "../src/agent/worker/tool-registry.js";
import { writeFile } from "node:fs/promises";
test("registered native tools enforce activated policy before accessing content", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "registry-policy-"));
  try {
    await mkdir(path.join(workspace, ".xarab"));
    await writeFile(path.join(workspace, "secret.txt"), "do not disclose");
    await writeFile(
      path.join(workspace, ".xarab/command-policy.json"),
      JSON.stringify({ version: 1, files: { "secret.txt": "deny" } }),
    );
    const { tools } = createToolRegistry({
      workspace,
      onToolEvent: () => {},
      getMessages: () => [],
      getCurrentAgentMessage: () => undefined,
      sessionChanged: () => {},
      notify: () => {},
      requestQuestions: async () => ({
        cancelled: false,
        answers: [{ id: "workspace_policy", choices: ["Approve"] }],
      }),
    });
    const result = await tools.read_file.handler({ path: "secret.txt" });
    assert.equal(result.ok, false);
    assert.match(result.output, /workspace policy/);
    assert.doesNotMatch(result.output, /do not disclose/);
    for (const name of ["search_content", "search_files", "list_files"]) {
      for (const target of [" . ", "", "   "]) {
        const blocked = await tools[name].handler({ path: target, query: "do not disclose" });
        assert.equal(blocked.ok, false, `${name}: ${JSON.stringify(target)}`);
        assert.match(blocked.output, /workspace policy/);
        assert.doesNotMatch(blocked.output, /secret.txt|do not disclose/);
      }
    }
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("native checks cover ancestors, symlink aliases, images and approval", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "native-policy-"));
  try {
    await mkdir(path.join(workspace, "private"));
    await symlink("private", path.join(workspace, "alias"));
    const policy = parsePolicy(
      JSON.stringify({
        version: 1,
        folders: { private: "deny", reviewed: "verify" },
        files: { "public.txt": "allow" },
      }),
    );
    const check = (name, params, requestQuestions) =>
      authorizeNativeTool({ workspace, policy, name, params, requestQuestions });
    assert.equal(await check("read_file", { path: "private/key" }), false);
    assert.equal(await check("write", { path: "alias/new" }), false);
    for (const name of ["search_content", "search_files", "list_files"])
      assert.equal(await check(name, {}), false);
    assert.equal(await check("generate_image", { folder: "private" }), false);
    assert.equal(await check("edit_image", { path: "private/input.png", folder: "public" }), false);
    assert.equal(await check("read_file", { path: "public.txt" }), true);
    assert.equal(await check("write", { path: "reviewed/new" }), false);
    assert.equal(
      await check("write", { path: "reviewed/new" }, async () => ({
        cancelled: false,
        answers: [{ id: "workspace_policy", choices: ["Approve"] }],
      })),
      true,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("command policy denies before assessment and assesses unmatched group members", async () => {
  const policy = parsePolicy(
    JSON.stringify({
      version: 1,
      commands: { echo: "allow", rm: "deny" },
      folders: { private: "deny" },
    }),
  );
  const calls = [];
  const authorize = (command) =>
    authorizeCommand({
      command,
      workspace: process.cwd(),
      policy,
      assess: async ({ command }) => {
        calls.push(command);
        return { risk: "low", scope: "workspace", reason: "test" };
      },
    });
  assert.equal((await authorize("echo hello")).approved, true);
  assert.deepEqual(calls, []);
  assert.equal((await authorize("echo hello && rm file")).approved, false);
  assert.equal((await authorize("echo private/key")).approved, false);
  assert.equal((await authorize("echo hello && git status")).approved, true);
  assert.deepEqual(calls, ["git status"]);
});
