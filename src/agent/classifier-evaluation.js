export async function evaluateTierCases({ classifier, cases }) {
  validateCases(cases);
  const matrix = Object.fromEntries(
    [1, 2, 3].map((tier) => [tier, { 1: 0, 2: 0, 3: 0, invalid: 0 }]),
  );
  const results = [];
  let exact = 0;
  let underRouted = 0;
  let overRouted = 0;
  let absoluteTierError = 0;
  let elapsedMs = 0;

  for (const item of cases) {
    const startedAt = performance.now();
    let classification;
    let error;
    try {
      classification = await classifier.classify({
        prompt: item.prompt,
        recentMessages: item.recentMessages ?? [],
      });
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      classification = { valid: false, tier: null, confidence: null, rationale: "" };
    }
    const durationMs = performance.now() - startedAt;
    elapsedMs += durationMs;
    const validTier = classification?.valid && [1, 2, 3].includes(classification.tier);
    const predicted = validTier ? classification.tier : null;
    matrix[item.tier][predicted ?? "invalid"]++;
    if (!validTier) error ??= classification?.error ?? "Invalid classifier result.";
    else {
      if (predicted === item.tier) exact++;
      if (predicted < item.tier) underRouted++;
      if (predicted > item.tier) overRouted++;
      absoluteTierError += Math.abs(predicted - item.tier);
    }
    results.push({
      id: item.id,
      expectedTier: item.tier,
      predictedTier: predicted,
      confidence:
        validTier && Number.isFinite(classification.confidence) ? classification.confidence : null,
      rationale: validTier ? classification.rationale : "",
      rawOutput: classification?.rawOutput ?? "",
      durationMs,
      error,
    });
  }

  const validCount = results.filter((result) => result.predictedTier !== null).length;
  return {
    total: cases.length,
    validCount,
    invalidCount: cases.length - validCount,
    exact,
    accuracy: cases.length ? exact / cases.length : 0,
    validAccuracy: validCount ? exact / validCount : 0,
    underRouted,
    overRouted,
    twoTierUnderRoutes: results.filter(
      (result) => result.predictedTier !== null && result.expectedTier - result.predictedTier === 2,
    ).length,
    meanAbsoluteTierError: validCount ? absoluteTierError / validCount : 0,
    meanDurationMs: cases.length ? elapsedMs / cases.length : 0,
    matrix,
    results,
  };
}

export function validateCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) throw new Error("Evaluation dataset is empty.");
  const ids = new Set();
  for (const [index, item] of cases.entries()) {
    if (!item || typeof item !== "object") throw new Error(`Case ${index + 1} must be an object.`);
    if (typeof item.id !== "string" || !item.id.trim() || ids.has(item.id))
      throw new Error(`Case ${index + 1} must have a unique, non-empty id.`);
    ids.add(item.id);
    if (![1, 2, 3].includes(item.tier))
      throw new Error(`Case ${item.id} has an invalid expected tier.`);
    if (typeof item.prompt !== "string" || !item.prompt.trim())
      throw new Error(`Case ${item.id} must have a non-empty prompt.`);
    if (
      item.recentMessages !== undefined &&
      (!Array.isArray(item.recentMessages) ||
        item.recentMessages.some(
          (message) =>
            !message ||
            !["user", "agent"].includes(message.type) ||
            typeof message.message !== "string",
        ))
    )
      throw new Error(`Case ${item.id} has invalid recent conversation messages.`);
  }
  return true;
}

export function formatEvaluationReport(report) {
  const percent = (value) => `${(value * 100).toFixed(1)}%`;
  const rows = [
    "Expected\\Predicted | Tier 1 | Tier 2 | Tier 3 | Invalid",
    "------------------ | ------ | ------ | ------ | -------",
    ...[1, 2, 3].map((tier) => {
      const row = report.matrix[tier];
      return `Tier ${tier}             | ${String(row[1]).padStart(6)} | ${String(row[2]).padStart(6)} | ${String(row[3]).padStart(6)} | ${String(row.invalid).padStart(7)}`;
    }),
  ];
  const lines = [
    `Cases: ${report.total} (${report.validCount} valid, ${report.invalidCount} invalid)`,
    `Exact tier accuracy: ${percent(report.accuracy)}`,
    `Under-routed: ${report.underRouted} · Over-routed: ${report.overRouted} · Two-tier under-routes: ${report.twoTierUnderRoutes}`,
    `Mean absolute tier error: ${report.meanAbsoluteTierError.toFixed(2)} · Mean classification time: ${report.meanDurationMs.toFixed(0)} ms`,
    "",
    ...rows,
  ];
  const misses = report.results.filter(
    (result) => result.predictedTier !== result.expectedTier || result.error,
  );
  if (misses.length) {
    lines.push("", "Cases to review:");
    for (const result of misses) {
      lines.push(
        `- ${result.id}: expected ${result.expectedTier}, got ${result.predictedTier ?? "invalid"}${result.confidence === null ? "" : ` (confidence ${result.confidence.toFixed(2)})`}${result.error ? ` — ${result.error}` : ` — ${result.rationale}`}`,
      );
      if (result.rawOutput && result.predictedTier === null)
        lines.push(`  Raw: ${JSON.stringify(result.rawOutput)}`);
    }
  }
  return lines.join("\n");
}
