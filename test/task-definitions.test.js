import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverTaskAgents } from "../src/agent/task-definitions.js";
import { createTaskTool } from "../src/agent/worker/tools/task-tool.js";

test("agent discovery supports built-in and bounded project profiles, not symlink definitions", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "xarab-task-agents-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, ".agents", "agents");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "debug.md"),
    "---\nname: debug\ndescription: Debug a problem\n---\nFind the root cause.\n",
  );
  await symlink(path.join(directory, "debug.md"), path.join(directory, "linked.md"));
  const { agents, diagnostics } = await discoverTaskAgents(root);
  assert.deepEqual(diagnostics, []);
  assert.equal(agents.get("debug").instructions, "Find the root cause.");
  assert.ok(agents.has("general-purpose"));
  assert.equal(agents.has("linked"), false);
  let request;
  const tool = createTaskTool({
    workspace: root,
    runner: {
      async run(options) {
        request = options;
        return { status: "completed", value: "Summary" };
      },
    },
  });
  const result = await tool.handler({
    brief: "Investigate",
    agent: "debug",
    context: "Selected context",
    mcpServers: [],
  });
  assert.equal(result.output, "Summary");
  assert.equal(request.instructions, "Find the root cause.");
  assert.deepEqual(request.mcpServers, []);
  await assert.rejects(tool.handler({ brief: "Task", agent: "missing" }), /Unknown/);
});

test("malformed profiles report diagnostics without blocking valid agents", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "xarab-task-invalid-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const directory = path.join(root, ".agents", "agents");
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "broken.md"), "invalid");
  await writeFile(path.join(directory, "huge.md"), "x".repeat(65537));
  await writeFile(
    path.join(directory, "valid.md"),
    "---\nname: valid\ndescription: Valid\n---\nInstructions\n",
  );
  const { agents, diagnostics } = await discoverTaskAgents(root);
  assert.ok(agents.has("general-purpose"));
  assert.ok(agents.has("valid"));
  assert.deepEqual(
    diagnostics.map((item) => item.name),
    ["broken", "huge"],
  );
  const tool = createTaskTool({
    workspace: root,
    runner: { run: async () => ({ status: "completed", value: "done" }) },
  });
  const catalog = JSON.parse(await tool.catalog());
  assert.equal(catalog.diagnostics.length, 2);
  assert.equal((await tool.handler({ brief: "Task" })).output, "done");
  assert.equal((await tool.handler({ brief: "Task", agent: "valid" })).output, "done");
  await assert.rejects(
    tool.handler({ brief: "Task", agent: "broken" }),
    /Invalid agent definition: broken/,
  );
  await assert.rejects(
    tool.handler({ brief: "Task", agent: "huge" }),
    /Agent definition too large: huge/,
  );
  await writeFile(
    path.join(directory, "broken.md"),
    "---\nname: broken\ndescription: Fixed\n---\nInstructions\n",
  );
  assert.equal((await tool.handler({ brief: "Task", agent: "broken" })).output, "done");
});
