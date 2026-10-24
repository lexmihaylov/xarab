import assert from "node:assert/strict";
import test from "node:test";
import { createOpenRouterClassifierAdapter } from "../src/agent/classifier/openrouter-classifier-adapter.js";
import { createClassifier } from "../src/agent/classifier/classifier.js";

test("OpenRouter classifier receives instructions and parses the tier", async () => {
  let body;
  const adapter = createOpenRouterClassifierAdapter({
    model: "vendor/router",
    getApiKey: () => "key",
    fetchImpl: async (_, options) => {
      body = JSON.parse(options.body);
      return new Response(
        'data: {"choices":[{"delta":{"content":"{\\\"tier\\\":2,\\\"rationale\\\":\\\"Needs investigation\\\"}"}}]}\n\ndata: [DONE]\n\n',
      );
    },
  });
  const classifier = createClassifier({
    getAssignment: () => ({ provider: "openrouter", model: "vendor/router" }),
    localAdapterFactory: () => {
      throw new Error("wrong provider");
    },
    openAIAdapterFactory: () => {
      throw new Error("wrong provider");
    },
    openRouterAdapterFactory: () => adapter,
  });
  const result = await classifier.classify("Explain a codebase change");
  assert.equal(result.valid, true);
  assert.equal(result.tier, 2);
  assert.equal(body.model, "vendor/router");
  assert.equal(body.messages[0].role, "system");
});
