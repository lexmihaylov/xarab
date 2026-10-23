import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createReadFileTool } from "../../../../src/agent/worker/tools/read-file-tool.js";

async function withWorkspace(run) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-read-tool-"));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("reads a UTF-8 file from line 1 and reports the read range", async () => {
  await withWorkspace(async (workspace) => {
    const filePath = path.join(workspace, "hello.txt");
    await writeFile(filePath, "first line\nsecond line");
    const events = [];
    const tool = createReadFileTool({ workspace, onEvent: (event) => events.push(event) });

    const result = await tool.handler({ path: "hello.txt" });
    assert.match(result, /^File: hello\.txt\nLines 1-2\nfirst line\nsecond line$/);
    assert.deepEqual(events, [
      {
        type: "read",
        path: "hello.txt",
        offset: 1,
        endLine: 2,
        nextOffset: undefined,
        bytes: Buffer.byteLength("first line\nsecond line"),
        truncated: false,
        tokens: Math.ceil(result.length / 4),
      },
    ]);
  });
});

test("reads full unnumbered lines and supports CRLF source text", async () => {
  await withWorkspace(async (workspace) => {
    const content = "first\r\n  target value  \r\nlast\r\n";
    await writeFile(path.join(workspace, "crlf.txt"), content);
    const tool = createReadFileTool({ workspace });

    const result = await tool.handler({ path: "crlf.txt" });
    assert.match(result, /first\n  target value  \nlast/);
    assert.doesNotMatch(result, /1: first/);
    assert.doesNotMatch(result, /line shortened/);
  });
});

test("documents OpenCode-style offset and limit parameters", async () => {
  await withWorkspace(async (workspace) => {
    const tool = createReadFileTool({ workspace });
    assert.match(tool.description, /offset \(1-based line number, default 1\)/);
    assert.match(tool.description, /50 KiB/);
    assert.deepEqual(tool.params.required, ["path"]);
    assert.deepEqual(Object.keys(tool.params.properties), ["path", "offset", "limit"]);
  });
});

test("reads the requested offset and limit and reports the next offset", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, "paged.txt"),
      Array.from({ length: 8 }, (_, index) => `line ${index + 1}`).join("\n"),
    );
    const tool = createReadFileTool({ workspace });
    const result = await tool.handler({ path: "paged.txt", offset: 4, limit: 2 });
    assert.match(result, /Lines 4-5 \(more available\)/);
    assert.match(result, /line 4[\s\S]*line 5/);
    assert.match(result, /continue with offset: 6/);
    assert.doesNotMatch(result, /6: line 6/);
  });
});

test("rejects paths outside the workspace, including escaping symlinks", async () => {
  await withWorkspace(async (workspace) => {
    const outside = path.join(path.dirname(workspace), `${path.basename(workspace)}-outside.txt`);
    await writeFile(outside, "private");
    await symlink(outside, path.join(workspace, "outside-link.txt"));
    try {
      const tool = createReadFileTool({ workspace });
      assert.match(await tool.handler({ path: "../secret.txt" }), /outside the workspace/);
      assert.match(
        await tool.handler({ path: "outside-link.txt" }),
        /resolves outside the workspace/,
      );
    } finally {
      await rm(outside, { force: true });
    }
  });
});

test("rejects directories and binary data", async () => {
  await withWorkspace(async (workspace) => {
    await mkdir(path.join(workspace, "folder"));
    await writeFile(path.join(workspace, "binary.dat"), Buffer.from([0, 1, 2]));
    const tool = createReadFileTool({ workspace });

    assert.match(await tool.handler({ path: "folder" }), /not a regular file/);
    assert.match(await tool.handler({ path: "binary.dat" }), /binary files/);
  });
});

test("reads beyond the default page when given a later offset", async () => {
  await withWorkspace(async (workspace) => {
    const lines = Array.from({ length: 620 }, (_, index) => `line ${index + 1}`);
    await writeFile(path.join(workspace, "large.txt"), lines.join("\n"));
    const tool = createReadFileTool({ workspace });

    const result = await tool.handler({ path: "large.txt", offset: 619, limit: 2 });
    assert.match(result, /line 619/);
    assert.match(result, /line 620/);
    assert.doesNotMatch(result, /more available/);
  });
});

test("caps pages at 50 KiB without shortening source lines", async () => {
  await withWorkspace(async (workspace) => {
    const longLine = "x".repeat(2_500);
    await writeFile(
      path.join(workspace, "many.txt"),
      Array.from({ length: 40 }, () => longLine).join("\n"),
    );
    const tool = createReadFileTool({
      workspace,
      tokenize: (text) => Array.from(text),
      getTokenBudget: () => 100_000,
    });
    const result = await tool.handler({ path: "many.txt" });
    assert.match(result, /Lines 1-20 \(more available\)/);
    assert.doesNotMatch(result, /line shortened/);
    assert.match(result, /continue with offset: 21/);
    assert.ok(Buffer.byteLength(result.split("\n\nMore content")[0]) <= 50 * 1024 + 100);
  });
});

test("caps line count at 2,000 and respects the requested model context budget", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, "many.txt"),
      Array.from({ length: 2_100 }, (_, index) => `line ${index + 1}`).join("\n"),
    );
    const tool = createReadFileTool({ workspace, getTokenBudget: () => 100_000 });
    const result = await tool.handler({ path: "many.txt" });
    assert.match(result, /Lines 1-2000 \(more available\)/);
    assert.match(result, /continue with offset: 2001/);
  });

  await withWorkspace(async (workspace) => {
    await writeFile(
      path.join(workspace, "many.txt"),
      Array.from({ length: 100 }, (_, index) => `line ${index + 1}`).join("\n"),
    );
    const tool = createReadFileTool({
      workspace,
      tokenize: (text) => Array.from(text),
      getTokenBudget: () => 256,
    });
    const result = await tool.handler({ path: "many.txt" });
    assert.ok(Array.from(result).length <= 256);
    assert.match(result, /continue with offset:/);
  });
});

test("rejects reads when the response-size limit cannot fit an excerpt", async () => {
  await withWorkspace(async (workspace) => {
    await writeFile(path.join(workspace, "file.txt"), "content");
    const tool = createReadFileTool({ workspace, getTokenBudget: () => 32 });
    assert.match(await tool.handler({ path: "file.txt" }), /response-size limit is too small/);
    const normalTool = createReadFileTool({ workspace });
    assert.match(
      await normalTool.handler({ path: "file.txt", offset: 0 }),
      /offset must be a positive line number/,
    );
    assert.match(
      await normalTool.handler({ path: "file.txt", limit: 2_001 }),
      /limit must be an integer/,
    );
  });
});
