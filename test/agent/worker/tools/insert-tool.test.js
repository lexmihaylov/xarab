import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInsertTool } from "../../../../src/agent/worker/tools/insert-tool.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-insert-tool-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("insert_before adds text immediately before a unique anchor", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "file.txt");
    await writeFile(target, "start\nanchor text\nend\n");
    const events = [];
    const tool = createInsertTool({
      workspace,
      position: "before",
      onEvent: (event) => events.push(event),
    });

    assert.match(
      await tool.handler({ path: "file.txt", anchor: "anchor text", content: "inserted\n" }),
      /Inserted before anchor/,
    );
    assert.equal(await readFile(target, "utf8"), "start\ninserted\nanchor text\nend\n");
    assert.equal(events[0].type, "edited");
    assert.equal(events[0].path, "file.txt");
    assert.equal(events[0].action, "Inserted before");
    assert.match(events[0].diffText, /\+inserted/);
  });
});

test("insert_after adds text immediately after a unique anchor", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "file.txt");
    await writeFile(target, "start\nanchor text\nend\n");
    const tool = createInsertTool({ workspace, position: "after" });

    assert.match(
      await tool.handler({ path: "file.txt", anchor: "anchor text", content: "\ninserted" }),
      /Inserted after anchor/,
    );
    assert.equal(await readFile(target, "utf8"), "start\nanchor text\ninserted\nend\n");
  });
});

test("line-boundary insertions add missing newlines using the file convention", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "file.txt");
    await writeFile(target, "first\r\nanchor\r\nlast");
    const before = createInsertTool({ workspace, position: "before" });
    assert.match(
      await before.handler({ path: "file.txt", anchor: "anchor", content: "added" }),
      /Inserted before/,
    );
    assert.equal(await readFile(target, "utf8"), "first\r\nadded\r\nanchor\r\nlast");

    const after = createInsertTool({ workspace, position: "after" });
    assert.match(
      await after.handler({ path: "file.txt", anchor: "last", content: "tail" }),
      /Inserted after/,
    );
    assert.equal(await readFile(target, "utf8"), "first\r\nadded\r\nanchor\r\nlast\r\ntail");
  });
});

test("requires an exact unique anchor and rejects unsafe paths", async () => {
  await withWorkspace(async (workspace) => {
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside.txt`);
    await writeFile(outside, "private");
    await symlink(outside, path.join(workspace, "linked.txt"));
    await writeFile(path.join(workspace, "file.txt"), "same same");
    const tool = createInsertTool({ workspace, position: "before" });
    try {
      assert.match(
        await tool.handler({ path: "file.txt", anchor: "missing", content: "x" }),
        /anchor was not found/,
      );
      assert.match(
        await tool.handler({ path: "file.txt", anchor: "same", content: "x" }),
        /must match exactly once/,
      );
      assert.match(
        await tool.handler({ path: "../secret.txt", anchor: "x", content: "y" }),
        /outside the workspace/,
      );
      assert.match(
        await tool.handler({ path: "linked.txt", anchor: "private", content: "x" }),
        /Symbolic-link/,
      );
      assert.equal(await readFile(outside, "utf8"), "private");
    } finally {
      await rm(outside, { force: true });
    }
  });
});

test("documents exact-anchor insertion", async () => {
  await withWorkspace(async (workspace) => {
    for (const position of ["before", "after"]) {
      const tool = createInsertTool({ workspace, position });
      assert.match(tool.description, /anchor must match exactly once/);
      assert.match(tool.description, /2-3 distinctive surrounding lines/);
      assert.match(tool.description, /adds a missing newline/);
      assert.deepEqual(tool.params.required, ["path", "anchor", "content"]);
    }
  });
});
