import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createConfigStore } from "../src/agent/config.js";

test("loads classifier model labels and ignores obsolete local worker selection", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-config-test-"));
  const configPath = path.join(directory, "config.json");
  const modelPath = path.join(directory, "coder.gguf");
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        lastModel: modelPath,
        models: {
          [modelPath]: { name: "My Classifier", contextSize: 24_576, customSetting: true },
        },
        apiKeys: { tavily: "test-key" },
      }),
    );
    const store = createConfigStore(configPath);
    await store.load();
    assert.deepEqual(store.getModel(modelPath), { name: "My Classifier" });
    assert.equal(store.getApiKey("tavily"), "test-key");

    assert.equal(store.get().lastModel, undefined);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("starts with empty defaults when the config file does not exist", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-config-test-"));
  try {
    const store = createConfigStore(path.join(directory, "config.json"));
    await store.load();
    assert.deepEqual(store.get(), {
      models: {},
      apiKeys: {},
      openaiModel: null,
      classifierModel: null,
      tierWorkers: {
        1: { provider: "openai" },
        2: { provider: "openai" },
        3: { provider: "openai" },
      },
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("persists a local classifier path and OpenAI-only tier worker models", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-config-routing-test-"));
  const configPath = path.join(directory, "config.json");
  try {
    const store = createConfigStore(configPath);
    await store.load();
    await store.setClassifierModel(path.join(directory, "smollm.gguf"));
    await store.setTierWorker(2, { provider: "openai", model: "gpt-6-astra" });
    await assert.rejects(
      store.setTierWorker(3, { provider: "local", model: path.join(directory, "local.gguf") }),
      /local GGUF models are reserved for classification/,
    );
    await store.setTierWorker(3, { provider: "openai", model: "gpt-tier-3" });

    assert.equal(store.getClassifierModel(), path.join(directory, "smollm.gguf"));
    assert.deepEqual(store.getTierWorker(2), { provider: "openai", model: "gpt-6-astra" });
    assert.deepEqual(store.getTierWorker(3), { provider: "openai", model: "gpt-tier-3" });
    const saved = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(saved.classifierModel, path.join(directory, "smollm.gguf"));
    assert.deepEqual(saved.tierWorkers[2], { provider: "openai", model: "gpt-6-astra" });
    assert.deepEqual(saved.tierWorkers[3], { provider: "openai", model: "gpt-tier-3" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("stores router assignments in a separate routing.conf", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-routing-conf-test-"));
  const configPath = path.join(directory, "router", "config.json");
  const routingConfigPath = path.join(directory, "xarab", "routing.conf");
  try {
    const store = createConfigStore(configPath, routingConfigPath);
    await store.load();
    await store.setClassifierModel(path.join(directory, "smollm.gguf"));
    await store.setTierWorker(1, { provider: "openai", model: "gpt-tier-1" });

    const routingConfig = JSON.parse(await readFile(routingConfigPath, "utf8"));
    assert.equal(routingConfig.classifierModel, path.join(directory, "smollm.gguf"));
    assert.deepEqual(routingConfig.tierWorkers[1], {
      provider: "openai",
      model: "gpt-tier-1",
    });
    await store.setOpenAIModel("gpt-6-astra");
    const generalConfig = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(generalConfig.openaiModel, "gpt-6-astra");
    assert.equal(Object.hasOwn(generalConfig, "classifierModel"), false);
    assert.equal(Object.hasOwn(generalConfig, "tierWorkers"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migrates legacy router settings out of the general config", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-routing-migration-test-"));
  const configPath = path.join(directory, "config.json");
  const routingConfigPath = path.join(directory, "routing.conf");
  const classifierPath = path.join(directory, "smollm.gguf");
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        openaiModel: "gpt-6-astra",
        classifierModel: classifierPath,
        tierWorkers: { 1: { provider: "local", model: "/models/coder.gguf" } },
      }),
    );
    const store = createConfigStore(configPath, routingConfigPath);
    await store.load();

    assert.equal(store.getClassifierModel(), classifierPath);
    assert.deepEqual(store.getTierWorker(1), { provider: "openai" });
    assert.equal(JSON.parse(await readFile(configPath, "utf8")).openaiModel, "gpt-6-astra");
    assert.deepEqual(JSON.parse(await readFile(routingConfigPath, "utf8")).tierWorkers[1], {
      provider: "openai",
    });
    const migrated = JSON.parse(await readFile(configPath, "utf8"));
    assert.equal(Object.hasOwn(migrated, "classifierModel"), false);
    assert.equal(Object.hasOwn(migrated, "tierWorkers"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("stores and removes provider API keys in a dedicated config section", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-config-test-"));
  const configPath = path.join(directory, "config.json");
  try {
    const store = createConfigStore(configPath);
    await store.load();
    await store.setApiKey("tavily", "  replacement-key  ");
    assert.equal(store.getApiKey("tavily"), "replacement-key");
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).apiKeys, {
      tavily: "replacement-key",
    });

    await store.removeApiKey("tavily");
    assert.equal(store.getApiKey("tavily"), undefined);
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).apiKeys, {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("ignores malformed API key entries when loading config", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-config-test-"));
  const configPath = path.join(directory, "config.json");
  try {
    await writeFile(
      configPath,
      JSON.stringify({ apiKeys: { tavily: "valid", "bad key": "ignored", exa: 7 } }),
    );
    const store = createConfigStore(configPath);
    await store.load();
    assert.deepEqual(store.get().apiKeys, { tavily: "valid" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("adds downloaded models and removes deleted models from persistent config", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "xarab-config-test-"));
  const configPath = path.join(directory, "config.json");
  const modelPath = path.join(directory, "downloaded.gguf");
  try {
    const store = createConfigStore(configPath);
    await store.load();
    await store.ensureModel(modelPath);
    assert.deepEqual(store.getModel(modelPath), {});

    await store.removeModel(modelPath);
    assert.equal(store.getModel(modelPath).name, undefined);
    assert.deepEqual(JSON.parse(await readFile(configPath, "utf8")).models, {});
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
