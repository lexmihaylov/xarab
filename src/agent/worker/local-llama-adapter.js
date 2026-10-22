import { getLlama, LlamaChatSession } from "node-llama-cpp";

const HANDOFF = Symbol("local worker handoff");

export function createLocalLlamaAdapter({
  modelRuntime = { getLlama, createSession: (options) => new LlamaChatSession(options) },
  contextSize = 16384,
  maxTokens = 4096,
} = {}) {
  let model;
  let context;
  let loading;
  let disposed = false;
  let disposal;

  async function load(modelPath) {
    if (!modelPath) throw new Error("A local worker model path is required.");
    if (model?.modelPath === modelPath) return model;
    await disposeResources();
    const llama = await modelRuntime.getLlama({ logLevel: "warn" });
    const loadedModel = await llama.loadModel({ modelPath });
    const loadedContext = await loadedModel.createContext({ contextSize, flashAttention: true });
    model = { modelPath, value: loadedModel };
    context = loadedContext;
    return model;
  }

  async function disposeResources() {
    const currentContext = context;
    const currentModel = model?.value;
    context = undefined;
    model = undefined;
    await currentContext?.dispose?.();
    await currentModel?.dispose?.();
  }

  async function run({
    model: modelPath,
    instructions,
    input,
    tools = {},
    signal,
    onText = () => {},
  }) {
    if (disposed) throw new Error("Local worker has been disposed.");
    if (signal?.aborted) throw abortError();
    if (!modelPath) throw new Error("A local worker model path is required.");
    await load(modelPath);
    if (signal?.aborted) throw abortError();

    const functions = Object.fromEntries(
      Object.entries(tools).map(([name, tool]) => [
        name,
        {
          description: tool.description,
          params: tool.params ?? { type: "object", properties: {} },
          async handler(params) {
            if (signal?.aborted) throw abortError();
            let result;
            try {
              result = normalizeToolResult(await tool.handler(params));
            } catch (error) {
              result = { ok: false, output: `Error: ${error?.message ?? String(error)}` };
            }
            if (result.stop) throw { [HANDOFF]: result.handoff };
            return result.output;
          },
        },
      ]),
    );
    const contextSequence = context.getSequence();
    await contextSequence.clearHistory();
    const session = modelRuntime.createSession({
      contextSequence,
      systemPrompt: instructions,
    });
    try {
      const prompt = formatInput(input);
      const result = await session.prompt(prompt, {
        functions,
        maxParallelFunctionCalls: 1,
        maxTokens,
        signal,
        onTextChunk: onText,
      });
      if (typeof result === "string") return {};
      return result ?? {};
    } catch (error) {
      if (error?.[HANDOFF]) return { handoff: error[HANDOFF] };
      throw error;
    } finally {
      await session.dispose?.();
      await contextSequence.clearHistory();
    }
  }

  return {
    run,
    async dispose() {
      if (disposal) return disposal;
      disposed = true;
      disposal = (async () => {
        await loading;
        await disposeResources();
      })();
      return disposal;
    },
  };
}

function formatInput(input) {
  if (!Array.isArray(input)) return String(input ?? "");
  return input
    .map((message) => {
      const content =
        typeof message.content === "string" ? message.content : JSON.stringify(message.content);
      return `${message.role === "assistant" ? "Assistant" : "User"}: ${content ?? ""}`;
    })
    .join("\n\n");
}

function normalizeToolResult(result) {
  if (result && typeof result === "object" && typeof result.ok === "boolean")
    return { ...result, output: String(result.output ?? "") };
  return { ok: true, output: typeof result === "string" ? result : JSON.stringify(result) };
}

function abortError() {
  const error = new Error("Generation was cancelled.");
  error.name = "AbortError";
  return error;
}
