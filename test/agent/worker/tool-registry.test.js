import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createToolRegistry } from "../../../src/agent/worker/tool-registry.js";

test("skill instructions reach the model but are omitted from the feed and stored result", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-skill-feed-"));
  const file = path.join(directory, "SKILL.md");
  const secretInstructions = "Detailed private skill workflow";
  await writeFile(file, `---\nname: review\ndescription: Review code\n---\n${secretInstructions}`);
  const canonicalFile = await realpath(file);
  const messages = [];
  const agentMessage = { type: "agent", message: "", parts: [] };
  try {
    const { tools } = createToolRegistry({
      workspace: process.cwd(),
      skills: new Map([
        ["review", { name: "review", description: "Review code", file: canonicalFile }],
      ]),
      configStore: { getApiKey: () => undefined },
      onToolEvent: () => {},
      getMessages: () => messages,
      getCurrentAgentMessage: () => agentMessage,
      sessionChanged: () => {},
      notify: () => {},
    });
    const result = await tools.skill.handler({ name: "review" });
    assert.match(result.output, new RegExp(secretInstructions));
    const part = agentMessage.parts[0];
    assert.equal(part.title, "Loaded skill: review");
    assert.equal(part.summary, "");
    assert.match(part.result.output, new RegExp(secretInstructions));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
