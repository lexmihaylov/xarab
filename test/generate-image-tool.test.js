import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createGenerateImageTool } from "../src/agent/worker/tools/generate-image-tool.js";

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("test")]);

test("generates a PNG in a workspace folder without exposing its bytes", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "xarab-image-"));
  try {
    const tool = createGenerateImageTool({
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
  const tool = createGenerateImageTool({
    workspace: os.tmpdir(),
    getCredentials: async () => ({ access_token: "test", account_id: "test" }),
    fetchImpl: async () => new Response(JSON.stringify({ data: [{ b64_json: "aGVsbG8=" }] })),
  });
  const result = await tool.handler({ prompt: "circle", folder: "assets" });
  assert.equal(result.ok, false);
  assert.match(result.output, /Invalid or oversized PNG/);
});

test("aborts image requests when the timeout expires", async () => {
  const tool = createGenerateImageTool({
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
