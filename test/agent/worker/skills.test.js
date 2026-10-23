import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, symlink, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { discoverSkills } from "../../../src/agent/worker/skills.js";
import { createSkillTool } from "../../../src/agent/worker/tools/skill-tool.js";

async function fixture(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), "xarab-skills-"));
  try {
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
async function skill(root, name, text) {
  const dir = path.join(root, ".agents", "skills", name);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "SKILL.md"), text);
}
const sample = (name, description = "Review code") =>
  `---\nname: ${name}\ndescription: ${description}\n---\nFollow this workflow.`;

test("discovers nearest valid skills, then global skills; loads only on demand", async () =>
  fixture(async (root) => {
    const project = path.join(root, "project");
    const child = path.join(project, "child");
    const home = path.join(root, "home");
    await mkdir(child, { recursive: true });
    await mkdir(path.join(project, ".git"));
    await skill(project, "review", sample("review", "Project review"));
    await skill(child, "review", sample("review", "Child review"));
    await skill(home, "global-task", sample("global-task"));
    await skill(project, "invalid", sample("different"));
    const skills = await discoverSkills(child, home);
    assert.deepEqual([...skills.keys()], ["review", "global-task"]);
    const tool = createSkillTool(skills);
    assert.match(tool.description, /Child review/);
    assert.doesNotMatch(tool.description, /Follow this workflow/);
    assert.match(await tool.handler({ name: "global-task" }), /Follow this workflow/);
    assert.match(await tool.handler({ name: "missing" }), /unknown skill/);
  }));

test("rejects symlinked SKILL.md and large files", async () =>
  fixture(async (root) => {
    const home = path.join(root, "home");
    await mkdir(home);
    await skill(root, "large", sample("large") + "x".repeat(65536));
    await skill(root, "linked", sample("linked"));
    await rm(path.join(root, ".agents", "skills", "linked", "SKILL.md"));
    await symlink(
      path.join(root, ".agents", "skills", "large", "SKILL.md"),
      path.join(root, ".agents", "skills", "linked", "SKILL.md"),
    );
    assert.equal((await discoverSkills(root, home)).size, 0);
  }));
