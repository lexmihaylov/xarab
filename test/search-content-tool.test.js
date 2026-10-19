import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSearchContentTool } from "../src/agent/search-content-tool.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-content-tool-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("documents distinctive content-search phrases", () => {
  const tool = createSearchContentTool();
  assert.match(tool.description, /distinctive 2-3 word phrase/);
  assert.match(tool.params.properties.query.description, /Avoid single words and common terms/);
});

test("fuzzy-searches text contents and returns file paths and line numbers", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"), { recursive: true });
    await mkdir(path.join(workspace, "docs"));
    await writeFile(
      path.join(workspace, "src", "agent.js"),
      "first line\nexport const role = 'local coding agent';\n",
    );
    await writeFile(
      path.join(workspace, "docs", "notes.md"),
      "This local coding agent runs in the terminal.\n",
    );
    await writeFile(path.join(workspace, ".hidden-secret.txt"), "local coding agent");
    const events = [];
    const tool = createSearchContentTool({ workspace, onEvent: (event) => events.push(event) });

    const result = await tool.handler({ query: "local coding agent" });
    assert.match(result, /src\/agent\.js:2:.*local coding agent/);
    assert.match(result, /docs\/notes\.md:1:.*local coding agent/);
    assert.deepEqual(events, [
      {
        type: "searched",
        query: "local coding agent",
        path: ".",
        files: 3,
        results: 3,
        truncated: false,
      },
    ]);
  });
});

test("supports searching a specific text file", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"));
    await writeFile(path.join(workspace, "src", "target.js"), "const targetPhrase = true;\n");
    await writeFile(path.join(workspace, "src", "other.js"), "const targetPhrase = false;\n");
    const tool = createSearchContentTool({ workspace });

    const result = await tool.handler({ query: "targetPhrase", path: "src/target.js" });
    assert.match(result, /src\/target\.js:1:.*targetPhrase/);
    assert.doesNotMatch(result, /other\.js/);
  });
});

test("supports a scoped content search and skips binary or oversized files", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "src"));
    await mkdir(path.join(workspace, "docs"));
    await writeFile(path.join(workspace, "src", "target.txt"), "needle in source\n");
    await writeFile(path.join(workspace, "docs", "other.txt"), "needle in docs\n");
    await writeFile(path.join(workspace, "src", "binary.dat"), Buffer.from([0, 1, 2]));
    await writeFile(path.join(workspace, "src", "large.txt"), Buffer.alloc(128 * 1024 + 1, 65));
    const tool = createSearchContentTool({ workspace });

    const result = await tool.handler({ query: "needle source", path: "src" });
    assert.match(result, /src\/target\.txt:1/);
    assert.doesNotMatch(result, /docs\/other\.txt|binary\.dat|large\.txt/);
    assert.match(await tool.handler({ query: "needle docs", path: "" }), /docs\/other\.txt:1/);
  });
});

test("rejects an external search directory and skips external symlinks", async () => {
  await withWorkspace(async (workspace) => {
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside`);
    await mkdir(outside);
    await writeFile(path.join(outside, "secret.txt"), "private phrase");
    await symlink(outside, path.join(workspace, "outside-link"));
    try {
      const tool = createSearchContentTool({ workspace });
      assert.match(
        await tool.handler({ query: "private phrase", path: "../outside" }),
        /outside the workspace/,
      );
      assert.match(await tool.handler({ query: "private phrase" }), /No content matched/);
    } finally {
      await rm(outside, { recursive: true, force: true });
    }
  });
});
