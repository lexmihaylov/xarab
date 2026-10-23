import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSearchFilesTool } from "../../../../src/agent/worker/tools/search-files-tool.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-search-tool-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("fuzzy-searches file paths and ranks closer matches first", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await writeFile(path.join(workspace, "src", "read-file.js"), "");
    await writeFile(path.join(workspace, "src", "refactor-list.js"), "");
    await writeFile(path.join(workspace, "src", "rfl.js"), "");
    const events = [];
    const tool = createSearchFilesTool({ workspace, onEvent: (event) => events.push(event) });

    const result = await tool.handler({ query: "rfl" });
    assert.match(result, /src\/read-file\.js/);
    assert.ok(result.indexOf("src/rfl.js") < result.indexOf("src/read-file.js"));
    assert.deepEqual(events, [
      { type: "searched", query: "rfl", path: ".", results: 3, truncated: false },
    ]);
  });
});

test("supports searching within a directory and reports empty results", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "src", "cli.js"), "");
    await writeFile(path.join(workspace, "README.md"), "");
    const tool = createSearchFilesTool({ workspace });

    assert.match(await tool.handler({ query: "cl", path: "src" }), /src\/cli\.js/);
    assert.match(await tool.handler({ query: "cli", path: "" }), /src\/cli\.js/);
    assert.match(await tool.handler({ query: "not-there" }), /No files matched/);
  });
});

test("rejects search paths outside the workspace and ignores external symlinks", async () => {
  await withWorkspace(async (workspace) => {
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside`);
    await mkdir(outside);
    await writeFile(path.join(outside, "hidden-file.txt"), "");
    await symlink(outside, path.join(workspace, "outside-link"));
    try {
      const tool = createSearchFilesTool({ workspace });
      assert.match(
        await tool.handler({ query: "hidden", path: "../outside" }),
        /outside the workspace/,
      );
      assert.match(await tool.handler({ query: "hidden" }), /No files matched/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
