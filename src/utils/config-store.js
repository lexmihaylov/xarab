import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const DEFAULT_TIER_WORKERS = Object.freeze({
  1: { provider: "openai" },
  2: { provider: "openai" },
  3: { provider: "openai" },
});

function normalizeTierWorkers(value) {
  const workers = structuredClone(DEFAULT_TIER_WORKERS);
  if (!value || typeof value !== "object" || Array.isArray(value)) return workers;
  for (const tier of [1, 2, 3]) {
    const worker = value[tier];
    if (!worker || typeof worker !== "object" || Array.isArray(worker)) continue;
    if (!["openai", "local"].includes(worker.provider)) continue;
    if (worker.provider === "local" && (typeof worker.model !== "string" || !worker.model.trim()))
      continue;
    workers[tier] = {
      provider: worker.provider,
      ...(typeof worker.model === "string" && worker.model.trim()
        ? {
            model:
              worker.provider === "local" ? path.resolve(worker.model.trim()) : worker.model.trim(),
          }
        : {}),
    };
  }
  return workers;
}

function normalizeClassifier(value) {
  if (typeof value === "string" && value.trim())
    return { provider: "local", model: path.resolve(value.trim()) };
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!["local", "openai"].includes(value.provider)) return null;
  if (typeof value.model !== "string" || !value.model.trim()) return null;
  return {
    provider: value.provider,
    model: value.provider === "local" ? path.resolve(value.model.trim()) : value.model.trim(),
  };
}

function normalizeModelMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([modelPath, settings]) => {
      if (!settings || typeof settings !== "object" || Array.isArray(settings)) return [];
      const name =
        typeof settings.name === "string" && settings.name.trim() ? settings.name.trim() : null;
      return [[modelPath, name ? { name } : {}]];
    }),
  );
}

export function createConfigStore(configPath, routingConfigPath = configPath) {
  const hasSeparateRoutingConfig = path.resolve(routingConfigPath) !== path.resolve(configPath);
  let config = {
    models: {},
    apiKeys: {},
    openaiModel: null,
    classifierModel: null,
    tierWorkers: structuredClone(DEFAULT_TIER_WORKERS),
  };
  let writeQueue = Promise.resolve();
  let routingWriteQueue = Promise.resolve();

  async function save() {
    const persistedConfig = {
      ...config,
      classifierModel:
        config.classifier?.provider === "local" ? config.classifier.model : config.classifierModel,
    };
    if (hasSeparateRoutingConfig) {
      delete persistedConfig.classifier;
      delete persistedConfig.classifierModel;
      delete persistedConfig.tierWorkers;
    }
    const contents = `${JSON.stringify(persistedConfig, null, 2)}\n`;
    const temporaryPath = `${configPath}.${process.pid}.tmp`;
    writeQueue = writeQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(configPath), { recursive: true });
        await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
        await rename(temporaryPath, configPath);
      });
    return writeQueue;
  }

  async function saveRouting() {
    if (!hasSeparateRoutingConfig) return save();
    const contents = `${JSON.stringify(
      {
        classifier: config.classifier,
        // Keep the legacy local path for older routing files and clients.
        classifierModel: config.classifier?.provider === "local" ? config.classifier.model : null,
        tierWorkers: config.tierWorkers,
      },
      null,
      2,
    )}\n`;
    const temporaryPath = `${routingConfigPath}.${process.pid}.tmp`;
    routingWriteQueue = routingWriteQueue
      .catch(() => {})
      .then(async () => {
        await mkdir(path.dirname(routingConfigPath), { recursive: true });
        await writeFile(temporaryPath, contents, { encoding: "utf8", mode: 0o600 });
        await rename(temporaryPath, routingConfigPath);
      });
    return routingWriteQueue;
  }

  return {
    async load() {
      let parsedConfig = {};
      try {
        const parsed = JSON.parse(await readFile(configPath, "utf8"));
        parsedConfig = parsed;
        config = {
          ...parsed,
          lastModel: undefined,
          models: normalizeModelMetadata(parsed.models),
          apiKeys:
            parsed.apiKeys && typeof parsed.apiKeys === "object" && !Array.isArray(parsed.apiKeys)
              ? Object.fromEntries(
                  Object.entries(parsed.apiKeys).filter(
                    ([provider, key]) => /^[a-z0-9_-]+$/i.test(provider) && typeof key === "string",
                  ),
                )
              : {},
          openaiModel: typeof parsed.openaiModel === "string" ? parsed.openaiModel : null,
          ...(normalizeClassifier(parsed.classifier ?? parsed.classifierModel)
            ? { classifier: normalizeClassifier(parsed.classifier ?? parsed.classifierModel) }
            : {}),
          classifierModel:
            typeof parsed.classifierModel === "string" && parsed.classifierModel.trim()
              ? path.resolve(parsed.classifierModel)
              : null,
          tierWorkers: normalizeTierWorkers(parsed.tierWorkers),
        };
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
      if (hasSeparateRoutingConfig) {
        try {
          const routingConfig = JSON.parse(await readFile(routingConfigPath, "utf8"));
          config = {
            ...config,
            ...(normalizeClassifier(routingConfig.classifier ?? routingConfig.classifierModel)
              ? {
                  classifier: normalizeClassifier(
                    routingConfig.classifier ?? routingConfig.classifierModel,
                  ),
                }
              : {}),
            classifierModel:
              typeof routingConfig.classifierModel === "string" &&
              routingConfig.classifierModel.trim()
                ? path.resolve(routingConfig.classifierModel)
                : null,
            tierWorkers: normalizeTierWorkers(routingConfig.tierWorkers),
          };
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          const hasLegacyRouting =
            Object.hasOwn(parsedConfig, "classifierModel") ||
            Object.hasOwn(parsedConfig, "classifier") ||
            Object.hasOwn(parsedConfig, "tierWorkers");
          if (hasLegacyRouting) {
            await saveRouting();
            await save();
          }
        }
      }
      return config;
    },
    get() {
      return config;
    },
    getModel(modelPath) {
      return config.models[path.resolve(modelPath)] ?? {};
    },
    getApiKey(provider) {
      return config.apiKeys[provider];
    },
    getOpenAIModel() {
      return config.openaiModel;
    },
    getClassifier() {
      return config.classifier ?? normalizeClassifier(config.classifierModel);
    },
    getClassifierModel() {
      const classifier = config.classifier ?? normalizeClassifier(config.classifierModel);
      return classifier?.provider === "local" ? classifier.model : null;
    },
    async setClassifier(assignment) {
      if (assignment !== null) {
        if (!assignment || !["local", "openai"].includes(assignment.provider))
          throw new Error("Classifier provider must be openai or local.");
        if (typeof assignment.model !== "string" || !assignment.model.trim())
          throw new Error("A classifier requires a model.");
      }
      config = {
        ...config,
        ...(assignment === null
          ? { classifier: undefined, classifierModel: null }
          : {
              classifier: {
                provider: assignment.provider,
                model:
                  assignment.provider === "local"
                    ? path.resolve(assignment.model.trim())
                    : assignment.model.trim(),
              },
              classifierModel: null,
            }),
      };
      await saveRouting();
    },
    async setClassifierModel(modelPath) {
      return this.setClassifier(
        modelPath === null ? null : { provider: "local", model: modelPath },
      );
    },
    getTierWorker(tier) {
      return config.tierWorkers[tier];
    },
    async setTierWorker(tier, worker) {
      if (![1, 2, 3].includes(tier)) throw new Error("Tier must be 1, 2, or 3.");
      if (!worker || !["openai", "local"].includes(worker.provider))
        throw new Error("Tier worker provider must be openai or local.");
      if (typeof worker.model !== "string" || !worker.model.trim())
        throw new Error(
          worker.provider === "local"
            ? "A local worker requires a model path."
            : "Worker model must be a non-empty model ID.",
        );
      const tierWorkers = {
        ...config.tierWorkers,
        [tier]: {
          provider: worker.provider,
          model:
            worker.provider === "local" ? path.resolve(worker.model.trim()) : worker.model.trim(),
        },
      };
      config = { ...config, tierWorkers };
      await saveRouting();
    },
    async setOpenAIModel(model) {
      if (typeof model !== "string" || !model.trim())
        throw new Error("OpenAI model must be a non-empty model ID.");
      config = { ...config, openaiModel: model.trim() };
      await save();
    },
    async setApiKey(provider, apiKey) {
      if (typeof provider !== "string" || !/^[a-z0-9_-]+$/i.test(provider))
        throw new Error("Provider must be a non-empty identifier.");
      if (typeof apiKey !== "string" || !apiKey.trim())
        throw new Error("API key must be a non-empty string.");
      config = { ...config, apiKeys: { ...config.apiKeys, [provider]: apiKey.trim() } };
      await save();
    },
    async removeApiKey(provider) {
      const apiKeys = { ...config.apiKeys };
      delete apiKeys[provider];
      config = { ...config, apiKeys };
      await save();
    },
    async ensureModel(modelPath) {
      const modelKey = path.resolve(modelPath);
      if (Object.hasOwn(config.models, modelKey)) return;
      config = { ...config, models: { ...config.models, [modelKey]: {} } };
      await save();
    },
    async removeModel(modelPath) {
      const modelKey = path.resolve(modelPath);
      const models = { ...config.models };
      delete models[modelKey];
      config = {
        ...config,
        models,
      };
      await save();
    },
  };
}
