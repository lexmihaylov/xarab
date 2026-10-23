import { access, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

const MODEL_URI = "hf:google/gemma-4-E2B-it-qat-q4_0-gguf:gemma-4-E2B_q4_0-it.gguf";
const MODEL_NAME = "hf_google_gemma-4-E2B-it-qat-q4_0.GEMMA-4-E2B_Q4_0-IT.GGUF.gguf";
const modelsDir = process.env.XARAB_MODELS_DIR || path.join(os.homedir(), ".xarab", "models");
const routingConfigPath = path.join(os.homedir(), ".xarab", "routing.conf");

function executable() {
  return process.platform === "win32" ? "node-llama-cpp.cmd" : "node-llama-cpp";
}

function runPull() {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(), ["pull", "--dir", modelsDir, MODEL_URI], {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`Classifier download failed${signal ? ` (${signal})` : ` (exit ${code})`}.`),
        );
    });
  });
}

async function readRoutingConfig() {
  try {
    const parsed = JSON.parse(await readFile(routingConfigPath, "utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

async function classifierFile() {
  const expected = path.join(modelsDir, MODEL_NAME);
  try {
    await access(expected);
    return expected;
  } catch {
    const files = await readdir(modelsDir, { withFileTypes: true }).catch(() => []);
    const match = files.find(
      (entry) => entry.isFile() && entry.name.toLowerCase() === MODEL_NAME.toLowerCase(),
    );
    return match ? path.join(modelsDir, match.name) : null;
  }
}

async function configureClassifier(modelPath) {
  const routing = await readRoutingConfig();
  if (
    routing.classifier ||
    (typeof routing.classifierModel === "string" && routing.classifierModel.trim())
  )
    return false;
  await mkdir(path.dirname(routingConfigPath), { recursive: true });
  const { classifierModel: _legacyClassifierModel, ...currentRouting } = routing;
  await writeFile(
    routingConfigPath,
    `${JSON.stringify(
      { ...currentRouting, classifier: { provider: "local", model: modelPath } },
      null,
      2,
    )}\n`,
    { encoding: "utf8", mode: 0o600 },
  );
  return true;
}

async function main() {
  if (process.env.XARAB_SKIP_POSTINSTALL === "1") {
    console.log("Xarab classifier download skipped (XARAB_SKIP_POSTINSTALL=1).");
    return;
  }

  const routing = await readRoutingConfig();
  if (typeof routing.classifierModel === "string" && routing.classifierModel.trim()) {
    console.log("Xarab classifier is already configured; skipping default classifier download.");
    return;
  }

  const existing = await classifierFile();
  if (!existing) {
    console.log("Downloading Xarab's default Gemma 4 E2B Q4_0 classifier…");
    await mkdir(modelsDir, { recursive: true });
    await runPull();
  }
  const installed = await classifierFile();
  if (!installed)
    throw new Error("Classifier download completed, but no Gemma 4 E2B Q4_0 GGUF file was found.");
  if (await configureClassifier(path.resolve(installed))) {
    console.log(`Xarab classifier configured: ${path.resolve(installed)}`);
  }
}

main().catch((error) => {
  console.error(`Xarab postinstall could not install the default classifier: ${error.message}`);
  process.exitCode = 1;
});
