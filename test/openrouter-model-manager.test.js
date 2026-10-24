import assert from "node:assert/strict";
import test from "node:test";
import { createOpenRouterModelManager } from "../src/agent/openrouter-model-manager.js";

test("does not request OpenRouter models without a key", async () => {
  const manager = createOpenRouterModelManager({
    getApiKey: () => undefined,
    fetchImpl: () => {
      throw new Error("unexpected request");
    },
  });
  assert.deepEqual(await manager.listModels(), []);
});

test("normalizes text models and sends the saved key", async () => {
  let authorization;
  const manager = createOpenRouterModelManager({
    getApiKey: () => "secret",
    fetchImpl: async (url, options) => {
      assert.equal(url, "https://openrouter.ai/api/v1/models");
      authorization = options.headers.authorization;
      return Response.json({
        data: [
          { id: "vendor/text", name: "Text", architecture: { output_modalities: ["text"] } },
          { id: "vendor/image", architecture: { output_modalities: ["image"] } },
        ],
      });
    },
  });
  assert.deepEqual(await manager.listModels(), [
    { provider: "openrouter", id: "vendor/text", name: "Text" },
  ]);
  assert.equal(authorization, "Bearer secret");
});

test("does not leak provider response data on discovery failure", async () => {
  const manager = createOpenRouterModelManager({
    getApiKey: () => "secret",
    fetchImpl: async () => new Response("secret", { status: 401 }),
  });
  await assert.rejects(manager.listModels(), /Could not list OpenRouter models \(401\)/);
});
