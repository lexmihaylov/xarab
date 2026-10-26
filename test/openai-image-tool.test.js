import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createOpenAIImageEditTool,
  createOpenAIImageGenerationTool,
} from "../src/agent/worker/tools/openai-image-tool.js";

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("test")]);

test("generates a PNG in a workspace folder without exposing its bytes", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "xarab-image-"));
  try {
    const tool = createOpenAIImageGenerationTool({
      workspace,
      getCredentials: async () => ({ access_token: "test", account_id: "test" }),
      fetchImpl: async (_url, request) => {
        assert.equal(JSON.parse(request.body).model, "gpt-image-2");
        return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), {
          headers: { "content-type": "application/json" },
        });
      },
    });
    const result = await tool.handler({ prompt: "circle", folder: "assets/generated" });
    assert.equal(result.ok, true);
    const filename = result.output.replace("Generated image: ", "");
    assert.ok(filename.startsWith("assets/generated/image-"));
    assert.deepEqual(await readFile(path.join(workspace, filename)), png);
    assert.ok(!result.output.includes(png.toString("base64")));
    assert.equal((await tool.handler({ prompt: "circle", folder: "../outside" })).ok, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rejects invalid image data", async () => {
  const tool = createOpenAIImageGenerationTool({
    workspace: os.tmpdir(),
    getCredentials: async () => ({ access_token: "test", account_id: "test" }),
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] })),
  });
  const result = await tool.handler({ prompt: "circle", folder: "assets" });
  assert.equal(result.ok, false);
  assert.match(result.output, /Invalid or oversized PNG/);
});

test("aborts image requests when the timeout expires", async () => {
  const tool = createOpenAIImageGenerationTool({
    workspace: os.tmpdir(),
    timeoutMs: 10,
    getCredentials: async () => ({ access_token: "test", account_id: "test" }),
    fetchImpl: async (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
  });
  const result = await tool.handler({ prompt: "circle", folder: "assets" });
  assert.equal(result.ok, false);
  assert.match(result.output, /request cancelled or timed out/);
});

test("edits a workspace PNG without overwriting the input", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "xarab-edit-"));
  try {
    await writeFile(path.join(workspace, "source.png"), png);
    const tool = createOpenAIImageEditTool({
      workspace,
      getCredentials: async () => ({ access_token: "test", account_id: "test" }),
      fetchImpl: async (url, request) => {
        assert.match(url, /\/images\/edits$/);
        const body = JSON.parse(request.body);
        assert.deepEqual(body.images, [
          { image_url: `data:image/png;base64,${png.toString("base64")}` },
        ]);
        return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }));
      },
    });
    const result = await tool.handler({
      path: "source.png",
      prompt: "Add a hat",
      folder: "edited",
    });
    assert.equal(result.ok, true);
    assert.deepEqual(await readFile(path.join(workspace, "source.png")), png);
    assert.deepEqual(
      await readFile(path.join(workspace, result.output.slice("Generated image: ".length))),
      png,
    );
    assert.equal(
      (await tool.handler({ path: "../secret.png", prompt: "Hat", folder: "edited" })).ok,
      false,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
