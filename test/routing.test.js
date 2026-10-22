import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTierClassificationPrompt,
  createLocalTierClassifier,
  parseTierClassification,
  TIER_CLASSIFIER_INSTRUCTIONS,
} from "../src/agent/routing.js";

test("classifier instructions distinguish focused, advanced, and specialized work", () => {
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /1 — Focused capability/);
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /2 — Advanced capability/);
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /3 — Specialized or highest-capability execution/);
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /broad and tightly interdependent context/);
  assert.match(
    TIER_CLASSIFIER_INSTRUCTIONS,
    /Classify planning, design, and research by the complexity/,
  );
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /A plan can require Tier 2 or Tier 3 capability/);
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /Plan or research a bounded feature/);
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /reusable skills system requiring discovery/);
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /External research is evidence of complexity/);
  assert.match(TIER_CLASSIFIER_INSTRUCTIONS, /polished interactive Three\.js 3D model/);
  assert.doesNotMatch(TIER_CLASSIFIER_INSTRUCTIONS, /Astra|Sol|Luna/);
});

test("classification prompt includes bounded recent user and assistant context", () => {
  const prompt = buildTierClassificationPrompt({
    prompt: "Now update the second function too",
    recentMessages: [
      { type: "system", message: "system text is not sent" },
      { type: "user", message: "Change the first function" },
      { type: "agent", message: "I changed the first function" },
    ],
  });
  assert.match(prompt, /Change the first function/);
  assert.match(prompt, /Now update the second function too/);
  assert.doesNotMatch(prompt, /system text is not sent/);
});

test("parses a valid tier classification and bounds the rationale", () => {
  const result = parseTierClassification(
    '{"tier":2,"confidence":0.82,"rationale":"Several dependent steps require investigation."}',
  );
  assert.deepEqual(result, {
    valid: true,
    tier: 2,
    confidence: 0.82,
    rationale: "Several dependent steps require investigation.",
    rawOutput:
      '{"tier":2,"confidence":0.82,"rationale":"Several dependent steps require investigation."}',
  });
});

test("rejects malformed, incomplete, or out-of-range classifier output", () => {
  for (const output of [
    "not JSON",
    '{"tier":4,"confidence":0.8,"rationale":"bad tier"}',
    '{"tier":2}',
  ]) {
    const result = parseTierClassification(output);
    assert.equal(result.valid, false);
    assert.equal(result.tier, null);
    assert.ok(result.error);
  }
});

test("loads one local model, resets context between cases, and releases resources", async () => {
  const calls = { loads: 0, contexts: 0, clears: 0, prompts: [], sessionsDisposed: 0 };
  const modelRuntime = {
    async createTierGrammar() {
      return { constrained: true };
    },
    async getLlama() {
      return {
        async loadModel(options) {
          calls.loads++;
          assert.equal(options.modelPath, "/models/classifier.gguf");
          return {
            async createContext() {
              calls.contexts++;
              return {
                getSequence() {
                  return {
                    async clearHistory() {
                      calls.clears++;
                    },
                  };
                },
                async dispose() {},
              };
            },
            async dispose() {},
          };
        },
      };
    },
    createSession(options) {
      assert.match(options.systemPrompt, /Classify the user's request by the work required/);
      return {
        async prompt(prompt, settings) {
          calls.prompts.push({ prompt, settings });
          return '{"tier":1,"confidence":0.9,"rationale":"Clear and bounded."}';
        },
        async dispose() {
          calls.sessionsDisposed++;
        },
      };
    },
  };
  const classifier = createLocalTierClassifier({
    modelPath: "/models/classifier.gguf",
    modelRuntime,
  });

  const first = await classifier.classify({ prompt: "Summarize this paragraph" });
  const second = await classifier.classify({ prompt: "Fix this typo" });
  await classifier.dispose();

  assert.equal(first.tier, 1);
  assert.equal(second.tier, 1);
  assert.equal(calls.loads, 1);
  assert.equal(calls.contexts, 1);
  assert.equal(calls.clears, 4, "history is cleared before and after each classification");
  assert.equal(calls.sessionsDisposed, 2);
  assert.equal(calls.prompts[0].settings.maxTokens, 80);
  assert.equal(calls.prompts[0].settings.temperature, 0);
  assert.deepEqual(calls.prompts[0].settings.grammar, { constrained: true });
});

test("serializes classifier calls and rejects use after disposal", async () => {
  const order = [];
  const sequence = { async clearHistory() {} };
  const runtime = {
    async createTierGrammar() {
      return { constrained: true };
    },
    async getLlama() {
      return {
        async loadModel() {
          return {
            async createContext() {
              return { getSequence: () => sequence, async dispose() {} };
            },
            async dispose() {},
          };
        },
      };
    },
    createSession() {
      return {
        async prompt(prompt) {
          const marker = prompt.includes("first") ? "first" : "second";
          order.push(`${marker}-start`);
          await new Promise((resolve) => setTimeout(resolve, 2));
          order.push(`${marker}-end`);
          return `{"tier":1,"confidence":1,"rationale":"${marker}"}`;
        },
        async dispose() {},
      };
    },
  };
  const classifier = createLocalTierClassifier({ modelPath: "model.gguf", modelRuntime: runtime });
  const first = classifier.classify({ prompt: "first" });
  const second = classifier.classify({ prompt: "second" });
  await Promise.all([first, second]);
  await classifier.dispose();

  assert.deepEqual(order, ["first-start", "first-end", "second-start", "second-end"]);
  await assert.rejects(classifier.classify({ prompt: "after dispose" }), /disposed/);
});

test("disposes resources after direct loading and shares concurrent disposal", async () => {
  const calls = { grammar: 0, context: 0, model: 0 };
  const runtime = {
    async createTierGrammar() {
      return {
        async dispose() {
          calls.grammar++;
        },
      };
    },
    async getLlama() {
      return {
        async loadModel() {
          return {
            async createContext() {
              return {
                getSequence: () => ({ async clearHistory() {} }),
                async dispose() {
                  calls.context++;
                },
              };
            },
            async dispose() {
              calls.model++;
            },
          };
        },
      };
    },
  };
  const classifier = createLocalTierClassifier({ modelPath: "model.gguf", modelRuntime: runtime });

  await classifier.load();
  const firstDisposal = classifier.dispose();
  const secondDisposal = classifier.dispose();
  assert.strictEqual(firstDisposal, secondDisposal);
  await Promise.all([firstDisposal, secondDisposal]);

  assert.deepEqual(calls, { grammar: 1, context: 1, model: 1 });
});
