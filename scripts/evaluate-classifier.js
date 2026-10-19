#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalTierClassifier } from "../src/agent/routing.js";
import { evaluateTierCases, formatEvaluationReport } from "../src/agent/classifier-evaluation.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelPaths = process.argv.slice(2).filter(Boolean);
if (!modelPaths.length && process.env.XARAB_CLASSIFIER_MODEL)
  modelPaths.push(process.env.XARAB_CLASSIFIER_MODEL);

if (!modelPaths.length) {
  console.error("Usage: npm run classifier:evaluate -- /path/to/a.gguf [/path/to/b.gguf ...]");
  process.exitCode = 2;
} else {
  const cases = JSON.parse(
    await readFile(path.join(projectRoot, "test/fixtures/classifier-cases.json"), "utf8"),
  );
  const summaries = [];
  for (const modelPath of modelPaths) {
    const resolvedModelPath = path.resolve(modelPath);
    let classifier;
    try {
      const modelStat = await stat(resolvedModelPath);
      if (!modelStat.isFile() || !resolvedModelPath.toLowerCase().endsWith(".gguf"))
        throw new Error("Classifier path must point to a local .gguf file.");
      classifier = createLocalTierClassifier({ modelPath: resolvedModelPath });
      const report = await evaluateTierCases({ classifier, cases });
      const name = path.basename(resolvedModelPath);
      summaries.push({ name, report });
      console.log(`\n=== ${name} ===\n`);
      console.log(formatEvaluationReport(report));
    } catch (error) {
      console.error(`Classifier evaluation failed for ${resolvedModelPath}: ${error.message}`);
      process.exitCode = 1;
    } finally {
      await classifier?.dispose().catch((error) => {
        console.error(`Classifier cleanup failed: ${error.message}`);
        process.exitCode = 1;
      });
    }
  }

  if (summaries.length > 1) {
    console.log("\n=== Model comparison ===\n");
    console.log(
      "Model | Accuracy | Valid accuracy | Tier 3 under-routes | 2-tier under-routes | Weighted error | Mean ms",
    );
    console.log("--- | ---: | ---: | ---: | ---: | ---: | ---:");
    for (const { name, report } of summaries)
      console.log(
        `${name} | ${(report.accuracy * 100).toFixed(1)}% | ${(report.validAccuracy * 100).toFixed(1)}% | ${report.matrix[3][1] ?? 0} | ${report.twoTierUnderRoutes} | ${report.weightedTierError} | ${report.meanDurationMs.toFixed(0)}`,
      );
  }
  if (summaries.some(({ report }) => report.invalidCount)) process.exitCode = 1;
}
