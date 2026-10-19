const TIERS = [1, 2, 3];

export async function evaluateTierCases({ classifier, cases }) {
  validateCases(cases);
  const matrix = Object.fromEntries(TIERS.map((tier) => [tier, { 1: 0, 2: 0, 3: 0, invalid: 0 }]));
  const categoryStats = {};
  const results = [];
  let exact = 0;
  let underRouted = 0;
  let overRouted = 0;
  let absoluteTierError = 0;
  let weightedTierError = 0;
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
    const validTier = classification?.valid && TIERS.includes(classification.tier);
    const predicted = validTier ? classification.tier : null;
    const category = item.category ?? "uncategorized";
    const categoryReport = (categoryStats[category] ??= {
      total: 0,
      exact: 0,
      valid: 0,
      underRouted: 0,
      overRouted: 0,
      twoTierUnderRoutes: 0,
      absoluteTierError: 0,
    });
    categoryReport.total++;
    matrix[item.tier][predicted ?? "invalid"]++;
    if (!validTier) error ??= classification?.error ?? "Invalid classifier result.";
    else {
      categoryReport.valid++;
      if (predicted === item.tier) {
        exact++;
        categoryReport.exact++;
      }
      if (predicted < item.tier) {
        underRouted++;
        categoryReport.underRouted++;
      }
      if (predicted > item.tier) {
        overRouted++;
        categoryReport.overRouted++;
      }
      const tierError = Math.abs(predicted - item.tier);
      absoluteTierError += tierError;
      categoryReport.absoluteTierError += tierError;
      if (item.tier - predicted === 2) categoryReport.twoTierUnderRoutes++;
      // Under-routing a high-complexity task is more serious than over-routing.
      weightedTierError += predicted < item.tier ? tierError * 2 : tierError;
    }
    results.push({
      id: item.id,
      category,
      difficulty: item.difficulty ?? null,
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
  const perTier = Object.fromEntries(
    TIERS.map((tier) => {
      const truePositive = matrix[tier][tier];
      const actual = TIERS.reduce((sum, predicted) => sum + matrix[tier][predicted], 0);
      const predictedTotal = TIERS.reduce((sum, expected) => sum + matrix[expected][tier], 0);
      const precision = predictedTotal ? truePositive / predictedTotal : 0;
      const recall = actual ? truePositive / actual : 0;
      return [
        tier,
        {
          precision,
          recall,
          f1: precision + recall ? (2 * precision * recall) / (precision + recall) : 0,
          support: actual,
        },
      ];
    }),
  );
  for (const report of Object.values(categoryStats)) {
    report.accuracy = report.total ? report.exact / report.total : 0;
    report.validAccuracy = report.valid ? report.exact / report.valid : 0;
    report.meanAbsoluteTierError = report.valid ? report.absoluteTierError / report.valid : 0;
    delete report.absoluteTierError;
  }

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
    weightedTierError,
    meanDurationMs: cases.length ? elapsedMs / cases.length : 0,
    matrix,
    perTier,
    categoryStats,
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
    if (!TIERS.includes(item.tier))
      throw new Error(`Case ${item.id} has an invalid expected tier.`);
    if (typeof item.prompt !== "string" || !item.prompt.trim())
      throw new Error(`Case ${item.id} must have a non-empty prompt.`);
    for (const field of ["category", "difficulty", "labelRationale"]) {
      if (item[field] !== undefined && (typeof item[field] !== "string" || !item[field].trim()))
        throw new Error(`Case ${item.id} has an invalid ${field}.`);
    }
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
    ...TIERS.map((tier) => {
      const row = report.matrix[tier];
      return `Tier ${tier}             | ${String(row[1]).padStart(6)} | ${String(row[2]).padStart(6)} | ${String(row[3]).padStart(6)} | ${String(row.invalid).padStart(7)}`;
    }),
  ];
  const lines = [
    `Cases: ${report.total} (${report.validCount} valid, ${report.invalidCount} invalid)`,
    `Exact tier accuracy: ${percent(report.accuracy)} (${percent(report.validAccuracy)} of valid)`,
    `Under-routed: ${report.underRouted} · Over-routed: ${report.overRouted} · Two-tier under-routes: ${report.twoTierUnderRoutes}`,
    `Mean absolute tier error: ${report.meanAbsoluteTierError.toFixed(2)} · Weighted error: ${report.weightedTierError} · Mean classification time: ${report.meanDurationMs.toFixed(0)} ms`,
    "",
    ...rows,
    "",
    "Per-tier precision / recall / F1:",
    ...TIERS.map((tier) => {
      const metric = report.perTier[tier];
      return `- Tier ${tier}: ${percent(metric.precision)} / ${percent(metric.recall)} / ${percent(metric.f1)} (n=${metric.support})`;
    }),
  ];
  if (Object.keys(report.categoryStats).length) {
    lines.push("", "By category:");
    for (const [category, stats] of Object.entries(report.categoryStats))
      lines.push(
        `- ${category}: ${percent(stats.accuracy)} (${stats.exact}/${stats.total}), under-routed ${stats.underRouted}`,
      );
  }
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
