import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  BASE_SYSTEM_PROMPT,
  buildSystemPrompt,
  loadProjectInstructions,
} from "../src/agent/instructions.js";

test("keeps the core system prompt concise", () => {
  assert.ok(BASE_SYSTEM_PROMPT.length < 4_500);
});

test("requires research and explicit approval before consequential implementation", () => {
  const prompt = buildSystemPrompt({ workspace: "/workspace" });
  assert.match(prompt, /do not begin making changes immediately/);
  assert.match(prompt, /present concise findings, affected files or systems/);
  assert.match(prompt, /wait for an explicit actionable user instruction/);
  assert.match(
    prompt,
    /Do not use edit, insert_before, insert_after, write, or consequential shell commands before the user explicitly authorizes implementation/,
  );
  assert.match(
    prompt,
    /If the user changes the requirements, revise the findings and plan and wait for approval again/,
  );
});

test("requires tool-backed research when unsure instead of inventing details", () => {
  const prompt = buildSystemPrompt({ workspace: "/workspace" });
  assert.match(
    prompt,
    /When unsure, research with available tools before answering or implementing/,
  );
  assert.match(
    prompt,
    /Verify APIs, configuration options, paths, and behavior against actual code or relevant documentation/,
  );
  assert.match(prompt, /never invent missing details/);
  assert.match(
    prompt,
    /If research is unavailable, fails, or is inconclusive, state what is unknown/,
  );
  assert.match(prompt, /ask for clarification if needed/);
});

test("does not require an intent announcement before tool use", () => {
  const prompt = buildSystemPrompt({
    workspace: "/workspace",
    availableTools: [{ name: "read_file", description: "Reads a file." }],
  });
  assert.match(prompt, /- read_file: Reads a file\./);
  assert.doesNotMatch(prompt, /announce_intent/i);
});

test("builds the coding-agent system prompt with ancestor instructions", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "xarab-instructions-"));
  const workspace = path.join(temporaryDirectory, "project", "src");
  try {
    await mkdir(workspace, { recursive: true });
    await writeFile(path.join(temporaryDirectory, "AGENTS.md"), "Parent guidance.");
    await writeFile(path.join(temporaryDirectory, "project", "AGENTS.md"), "Project guidance.");

    const instructions = await loadProjectInstructions(workspace);
    const prompt = buildSystemPrompt({ workspace, instructionFiles: instructions });

    assert.match(prompt, /You are Xarab, a tool-using coding assistant/);
    assert.match(prompt, /Available tools\n- None are currently registered/);
    assert.match(
      prompt,
      /Treat available tools as the primary way to inspect, change, and verify the workspace/,
    );
    assert.match(prompt, /Generate code iteratively, never in one large write or insertion/);
    assert.match(prompt, /Choose tools by task/);
    assert.match(prompt, /Shell suits tests, builds, Git, scripts, and batch work/);
    assert.match(prompt, /file tools suit searches, focused reads, and edits/);
    assert.match(prompt, /Use search_content to locate relevant code when helpful/);
    assert.match(prompt, /read_file with offset and limit/);
    assert.match(
      prompt,
      /use it rather than claiming you cannot run commands, inspect the workspace, or make requested changes/,
    );
    assert.match(prompt, /Follow tool schemas and actual permission\/approval prompts/);
    assert.match(
      prompt,
      /Do not narrate routine steps or repeat full files, applied code, or tool payloads/,
    );
    assert.match(prompt, /Use edit for focused replacements/);
    assert.match(prompt, /Use write only to create or completely replace a file/);
    assert.match(
      prompt,
      /Interpret shell output in the context of the user's task and carry forward only relevant findings/,
    );
    assert.ok(prompt.indexOf("Parent guidance.") < prompt.indexOf("Project guidance."));
    assert.match(prompt, /Workspace: .*project\/src/);
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});

test("builds a system prompt without project instruction files", () => {
  const prompt = buildSystemPrompt({ workspace: "/workspace", instructionFiles: [] });
  assert.match(prompt, /tool-using coding assistant/);
  assert.match(prompt, /Available tools\n- None are currently registered/);
  assert.match(prompt, /Treat available tools as the primary way/);
  assert.match(prompt, /Generate code iteratively, never in one large write or insertion/);
  assert.match(prompt, /Choose tools by task/);
  assert.match(
    prompt,
    /Xarab can execute workspace shell commands and edit workspace files through its available tools/,
  );
  assert.match(prompt, /Follow tool schemas and actual permission\/approval prompts/);
  assert.match(prompt, /Interpret shell output in the context of the user's task/);
  assert.doesNotMatch(prompt, /Project instructions:/);
});

test("injects tool catalog entries dynamically without hardcoding tool names", () => {
  const prompt = buildSystemPrompt({
    workspace: "/workspace",
    availableTools: [{ name: "future_tool", description: "Performs a future capability." }],
  });
  assert.match(prompt, /- future_tool: Performs a future capability\./);
  assert.doesNotMatch(prompt, /- read_file:/);
  assert.doesNotMatch(prompt, /- list_files:/);
});
