import { getLlama, LlamaChatSession } from "node-llama-cpp";

const defaultModelRuntime = {
  getLlama,
  createSession: (options) => new LlamaChatSession(options),
  createTierGrammar: (llama) =>
    llama.createGrammarForJsonSchema({
      type: "object",
      properties: {
        tier: { type: "integer", enum: [1, 2, 3] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        rationale: { type: "string", maxLength: 50 },
      },
      required: ["tier", "rationale"],
      additionalProperties: false,
    }),
};

export function createLocalLlamaClassifierAdapter({
  model: classifierModel,
  modelRuntime = defaultModelRuntime,
  contextSize = 8192,
  maxTokens = 80,
}) {
  const modelPath = classifierModel;
  if (!modelPath) throw new Error("A local classifier model path is required.");

  let model;
  let context;
  let contextSequence;
  let grammar;
  let loading;
  let queue = Promise.resolve();
  let disposed = false;
  let disposal;

  async function disposeResources() {
    const sequenceContext = context;
    const loadedModel = model;
    const loadedGrammar = grammar;
    context = undefined;
    contextSequence = undefined;
    model = undefined;
    grammar = undefined;

    // Release dependent resources first. Keep attempting cleanup if one resource
    // throws so a failed shutdown does not leave the model resident.
    let firstError;
    for (const resource of [sequenceContext, loadedModel, loadedGrammar]) {
      try {
        await resource?.dispose?.();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError) throw firstError;
  }

  async function load() {
    if (disposed) throw new Error("Classifier has been disposed.");
    if (contextSequence) return;
    if (loading) return loading;
    loading = (async () => {
      const llama = await modelRuntime.getLlama({ logLevel: "warn" });
      grammar = await modelRuntime.createTierGrammar(llama);
      model = await llama.loadModel({
        modelPath,
        gpuLayers: { fitContext: { contextSize } },
      });
      context = await model.createContext({ contextSize, flashAttention: true });
      contextSequence = context.getSequence();
      if (disposed) throw new Error("Classifier has been disposed.");
    })();
    try {
      await loading;
    } catch (error) {
      await disposeResources().catch(() => {});
      throw error;
    } finally {
      loading = undefined;
    }
  }

  async function runNow({ instructions, input, signal }) {
    if (disposed) throw new Error("Classifier has been disposed.");
    if (signal?.aborted) return "";
    await load();
    if (signal?.aborted) return "";
    await contextSequence.clearHistory();
    const session = modelRuntime.createSession({
      contextSequence,
      systemPrompt: instructions,
    });
    try {
      const output = await session.prompt(messagesToPrompt(input), {
        maxTokens,
        temperature: 0,
        topK: 1,
        grammar,
        signal,
      });
      return output;
    } finally {
      await session.dispose?.();
      await contextSequence.clearHistory();
    }
  }

  function messagesToPrompt(input) {
    if (!Array.isArray(input) || input.length === 0)
      throw new TypeError("Classifier input must be a non-empty message list.");
    return input
      .map((message) => {
        if (!message || typeof message.content !== "string")
          throw new TypeError("Classifier messages must have string content.");
        return message.content;
      })
      .join("\n\n");
  }

  return {
    load,
    run(input) {
      const operation = queue.then(() => runNow(input));
      queue = operation.catch(() => {});
      return operation;
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        // A classifier can be loaded directly by the router dialog, outside the
        // classification queue. Wait for both paths before disposing resources.
        await Promise.allSettled([queue, loading]);
        await disposeResources();
      })();
      return disposal;
    },
  };
}
