import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createOpenAIImageAnalysisTool } from "../src/agent/worker/tools/openai-image-analysis-tool.js";

const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), Buffer.from("test")]);
const stream = (events) =>
  new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""));

test("analyzes a workspace image without returning image bytes", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "xarab-analysis-"));
  try {
    await writeFile(path.join(workspace, "source.png"), png);
    const tool = createOpenAIImageAnalysisTool({
      workspace,
      getCredentials: async () => ({ access_token: "test", account_id: "test" }),
      fetchImpl: async (url, request) => {
        assert.match(url, /\/codex\/responses$/);
        const body = JSON.parse(request.body);
        assert.equal(body.input[0].content[0].text, "What is it?");
        assert.equal(
          body.input[0].content[1].image_url,
          `data:image/png;base64,${png.toString("base64")}`,
        );
        return stream([
          { type: "response.output_text.delta", delta: "A logo." },
          { type: "response.completed", response: { output: [] } },
        ]);
      },
    });
    assert.deepEqual(await tool.handler({ path: "source.png", question: "What is it?" }), {
      ok: true,
      output: "A logo.",
    });
    assert.equal((await tool.handler({ path: "../source.png", question: "What?" })).ok, false);
    await symlink(path.join(workspace, "source.png"), path.join(workspace, "link.png"));
    assert.equal((await tool.handler({ path: "link.png", question: "What?" })).ok, false);
    await writeFile(path.join(workspace, "invalid.png"), "hello");
    assert.equal((await tool.handler({ path: "invalid.png", question: "What?" })).ok, false);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});

test("rejects failed streams and honours timeout", async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "xarab-analysis-"));
  try {
    await writeFile(path.join(workspace, "source.png"), png);
    const options = {
      workspace,
      getCredentials: async () => ({ access_token: "test", account_id: "test" }),
    };
    const failure = createOpenAIImageAnalysisTool({
      ...options,
      fetchImpl: async () =>
        stream([{ type: "response.failed", response: { error: { code: "bad_request" } } }]),
    });
    assert.match(
      (await failure.handler({ path: "source.png", question: "What?" })).output,
      /bad_request/,
    );
    const timeout = createOpenAIImageAnalysisTool({
      ...options,
      timeoutMs: 10,
      fetchImpl: async (_url, { signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
        ),
    });
    assert.match(
      (await timeout.handler({ path: "source.png", question: "What?" })).output,
      /timed out/,
    );
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
