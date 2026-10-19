import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  evaluateTierCases,
  formatEvaluationReport,
  validateCases,
} from "../src/agent/classifier-evaluation.js";

test("evaluates tier accuracy, under-routing, over-routing, and invalid outputs", async () => {
  const cases = [
    { id: "exact", tier: 1, prompt: "simple" },
    { id: "under", tier: 3, prompt: "hard" },
    { id: "over", tier: 1, prompt: "also simple" },
    { id: "invalid", tier: 2, prompt: "bad output" },
  ];
  const outputs = [
    { valid: true, tier: 1, confidence: 0.9, rationale: "Bounded." },
    { valid: true, tier: 1, confidence: 0.4, rationale: "Misrouted low." },
    { valid: true, tier: 2, confidence: 0.6, rationale: "Misrouted high." },
    { valid: false, tier: null, error: "Bad JSON." },
  ];
  const report = await evaluateTierCases({
    cases,
    classifier: { classify: async () => outputs.shift() },
  });

  assert.equal(report.total, 4);
  assert.equal(report.validCount, 3);
  assert.equal(report.invalidCount, 1);
  assert.equal(report.exact, 1);
  assert.equal(report.underRouted, 1);
  assert.equal(report.overRouted, 1);
  assert.equal(report.twoTierUnderRoutes, 1);
  assert.equal(report.matrix[2].invalid, 1);
  assert.equal(report.perTier[1].support, 2);
  assert.equal(report.categoryStats.uncategorized.total, 4);
  assert.equal(report.weightedTierError, 5);
  assert.match(formatEvaluationReport(report), /Two-tier under-routes: 1/);
  assert.match(formatEvaluationReport(report), /Per-tier precision \/ recall \/ F1/);
  assert.match(formatEvaluationReport(report), /invalid — Bad JSON/);
});

test("validates the checked-in labeled dataset", async () => {
  const cases = JSON.parse(
    await readFile(new URL("./fixtures/classifier-cases.json", import.meta.url), "utf8"),
  );
  assert.equal(validateCases(cases), true);
  assert.ok(cases.some((item) => item.tier === 1));
  assert.ok(cases.some((item) => item.tier === 2));
  assert.ok(cases.some((item) => item.tier === 3));
});

test("rejects duplicate IDs and malformed context", () => {
  assert.throws(
    () =>
      validateCases([
        { id: "same", tier: 1, prompt: "one" },
        { id: "same", tier: 2, prompt: "two" },
      ]),
    /unique/,
  );
  assert.throws(
    () => validateCases([{ id: "bad-context", tier: 1, prompt: "x", recentMessages: [{}] }]),
    /recent conversation/,
  );
});
