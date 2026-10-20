import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEditTool } from "../src/agent/tools/edit-tool.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-edit-tool-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("replaces a unique exact string and reports the edit", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "file.txt");
    await writeFile(target, "before\nold value\nafter\n");
    const events = [];
    const tool = createEditTool({ workspace, onEvent: (event) => events.push(event) });

    assert.match(
      await tool.handler({ path: "file.txt", oldString: "old value", newString: "new value" }),
      /Edited file\.txt/,
    );
    assert.equal(await readFile(target, "utf8"), "before\nnew value\nafter\n");
    assert.equal(events[0].type, "edited");
    assert.equal(events[0].path, "file.txt");
    assert.equal(events[0].replacements, 1);
    assert.match(events[0].diffText, /-old value/);
    assert.match(events[0].diffText, /\+new value/);
  });
});

test("matches exact-read LF excerpts against CRLF files and preserves remaining bytes", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "crlf.txt");
    await writeFile(target, "before\r\nold value\r\nafter\r\n");
    const tool = createEditTool({ workspace });

    assert.match(
      await tool.handler({
        path: "crlf.txt",
        oldString: "old value\nafter",
        newString: "new value\nafter",
      }),
      /Edited crlf\.txt/,
    );
    assert.equal(await readFile(target, "utf8"), "before\r\nnew value\nafter\r\n");
  });
});

test("requires a unique match unless replaceAll is true", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "file.txt");
    await writeFile(target, "same\nsame\n");
    const tool = createEditTool({ workspace });

    assert.match(
      await tool.handler({ path: "file.txt", oldString: "same", newString: "other" }),
      /must match exactly once/,
    );
    assert.equal(await readFile(target, "utf8"), "same\nsame\n");
    assert.match(
      await tool.handler({
        path: "file.txt",
        oldString: "same",
        newString: "other",
        replaceAll: true,
      }),
      /2 replacements/,
    );
    assert.equal(await readFile(target, "utf8"), "other\nother\n");
  });
});

test("reports absent text and rejects unsafe targets", async () => {
  await withWorkspace(async (workspace) => {
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside.txt`);
    await writeFile(outside, "private");
    await writeFile(path.join(workspace, "file.txt"), "present");
    await symlink(outside, path.join(workspace, "linked.txt"));
    const tool = createEditTool({ workspace });
    try {
      assert.match(
        await tool.handler({ path: "missing.txt", oldString: "x", newString: "y" }),
        /does not exist/,
      );
      assert.match(
        await tool.handler({ path: "file.txt", oldString: "x", newString: "y" }),
        /was not found/,
      );
      assert.match(
        await tool.handler({ path: "../secret.txt", oldString: "x", newString: "y" }),
        /outside the workspace/,
      );
      assert.match(
        await tool.handler({ path: "linked.txt", oldString: "x", newString: "y" }),
        /Symbolic-link/,
      );
    } finally {
      await rm(outside, { force: true });
    }
  });
});

test("documents OpenCode-style exact-string edit semantics", async () => {
  await withWorkspace(async (workspace) => {
    const tool = createEditTool({ workspace });
    assert.match(tool.description, /oldString must match exactly once unless replaceAll is true/);
    assert.match(tool.description, /2-3 distinctive surrounding lines/);
    assert.deepEqual(tool.params.required, ["path", "oldString", "newString"]);
  });
});
