import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createListFilesTool } from "../src/agent/list-files-tool.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-list-tool-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("lists workspace files recursively while skipping heavy metadata directories", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await mkdir(path.join(workspace, "node_modules", "pkg"), { recursive: true });
    await mkdir(path.join(workspace, ".git", "objects"), { recursive: true });
    await writeFile(path.join(workspace, "README.md"), "docs");
    await writeFile(path.join(workspace, "src", "cli.js"), "source");
    await writeFile(path.join(workspace, "node_modules", "pkg", "ignored.js"), "ignored");
    await writeFile(path.join(workspace, ".git", "objects", "ignored"), "ignored");

    const events = [];
    const tool = createListFilesTool({ workspace, onEvent: (event) => events.push(event) });
    const result = await tool.handler({});

    assert.match(result, /README\.md/);
    assert.match(result, /src\/cli\.js/);
    assert.doesNotMatch(result, /node_modules|\.git/);
    assert.deepEqual(events, [{ type: "listed", path: ".", entries: 3, truncated: false }]);
  });
});

test("supports listing a subdirectory without recursion", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src", "nested"), { recursive: true });
    await writeFile(path.join(workspace, "src", "a.js"), "a");
    await writeFile(path.join(workspace, "src", "nested", "b.js"), "b");
    const tool = createListFilesTool({ workspace });

    const result = await tool.handler({ path: "src", recursive: false });
    assert.match(result, /src\/a\.js/);
    assert.doesNotMatch(result, /nested\/b\.js/);
    assert.match(await tool.handler({ path: "" }), /src\/a\.js/);
  });
});

test("rejects directories outside the workspace and does not follow symlinks", async () => {
  await withWorkspace(async (workspace) => {
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside`);
    await mkdir(outside);
    await writeFile(path.join(outside, "secret.txt"), "private");
    await symlink(outside, path.join(workspace, "outside-link"));
    try {
      const tool = createListFilesTool({ workspace });
      assert.match(await tool.handler({ path: "../outside" }), /outside the workspace/);
      assert.match(await tool.handler({ path: "outside-link" }), /resolves outside the workspace/);
      const rootListing = await tool.handler({});
      assert.match(rootListing, /outside-link@/);
      assert.doesNotMatch(rootListing, /secret\.txt/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
