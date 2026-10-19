#!/usr/bin/env node

import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalTierClassifier } from "../src/agent/routing.js";
import { evaluateTierCases, formatEvaluationReport } from "../src/agent/classifier-evaluation.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const modelPath = process.argv[2] || process.env.XARAB_CLASSIFIER_MODEL;
if (!modelPath) {
  console.error("Usage: npm run classifier:evaluate -- /path/to/classifier.gguf");
  process.exitCode = 2;
} else {
  const resolvedModelPath = path.resolve(modelPath);
  let classifier;
  try {
    const modelStat = await stat(resolvedModelPath);
    if (!modelStat.isFile() || !resolvedModelPath.toLowerCase().endsWith(".gguf"))
      throw new Error("Classifier path must point to a local .gguf file.");
    const cases = JSON.parse(
      await readFile(path.join(projectRoot, "test/fixtures/classifier-cases.json"), "utf8"),
    );
    classifier = createLocalTierClassifier({ modelPath: resolvedModelPath });
    const report = await evaluateTierCases({ classifier, cases });
    console.log(formatEvaluationReport(report));
    if (report.invalidCount) process.exitCode = 1;
  } catch (error) {
    console.error(`Classifier evaluation failed: ${error.message}`);
    process.exitCode = 1;
  } finally {
    await classifier?.dispose().catch((error) => {
      console.error(`Classifier cleanup failed: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
