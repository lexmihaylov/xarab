import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createWriteTool } from "../src/agent/write-tool.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-write-tool-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("creates a file and missing parent directories", async () => {
  await withWorkspace(async (workspace) => {
    const events = [];
    const tool = createWriteTool({ workspace, onEvent: (event) => events.push(event) });
    assert.match(
      await tool.handler({ path: "nested/deep/file.txt", content: "complete contents" }),
      /Created nested\/deep\/file\.txt/,
    );
    assert.equal(
      await readFile(path.join(workspace, "nested/deep/file.txt"), "utf8"),
      "complete contents",
    );
    assert.equal(events[0].type, "written");
    assert.equal(events[0].created, true);
    assert.match(events[0].diffText, /\+complete contents/);
  });
});

test("fully replaces an existing file", async () => {
  await withWorkspace(async (workspace) => {
    const target = path.join(workspace, "file.txt");
    await writeFile(target, "old contents\nthat should disappear");
    const tool = createWriteTool({ workspace });
    assert.match(
      await tool.handler({ path: "file.txt", content: "entirely new contents" }),
      /Wrote file\.txt/,
    );
    assert.equal(await readFile(target, "utf8"), "entirely new contents");
  });
});

test("rejects workspace escapes, symlinks, directories, and binary content", async () => {
  await withWorkspace(async (workspace) => {
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside.txt`);
    await writeFile(outside, "private");
    await symlink(outside, path.join(workspace, "linked.txt"));
    await mkdir(path.join(workspace, "folder"));
    const tool = createWriteTool({ workspace });
    try {
      assert.match(
        await tool.handler({ path: "../secret.txt", content: "x" }),
        /outside the workspace/,
      );
      assert.match(await tool.handler({ path: "linked.txt", content: "x" }), /Symbolic-link/);
      assert.match(await tool.handler({ path: "folder", content: "x" }), /regular file/);
      assert.match(
        await tool.handler({ path: "binary.bin", content: "\0" }),
        /binary file contents/,
      );
      assert.equal(await readFile(outside, "utf8"), "private");
    } finally {
      await rm(outside, { force: true });
    }
  });
});

test("documents full-file writes", async () => {
  await withWorkspace(async (workspace) => {
    const tool = createWriteTool({ workspace });
    assert.match(tool.description, /completely replace its contents/);
    assert.match(tool.description, /Missing parent directories are created/);
    assert.deepEqual(tool.params.required, ["path", "content"]);
  });
});
