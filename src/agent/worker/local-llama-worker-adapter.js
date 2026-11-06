import { randomUUID } from "node:crypto";
import { getLlama, LlamaChatSession } from "node-llama-cpp";

export function createLocalLlamaWorkerAdapter({
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
    let loadedContext;
    try {
      loadedContext = await loadedModel.createContext({ contextSize, flashAttention: true });
    } catch (error) {
      await Promise.resolve()
        .then(() => loadedModel.dispose?.())
        .catch(() => {});
      throw error;
    }
    model = { modelPath, value: loadedModel };
    context = loadedContext;
    return model;
  }

  async function disposeResources() {
    const currentContext = context;
    const currentModel = model?.value;
    context = undefined;
    model = undefined;
    try {
      await currentContext?.dispose?.();
    } finally {
      await currentModel?.dispose?.();
    }
  }

  async function run({
    model: modelPath,
    instructions,
    input,
    tools = {},
    signal,
    onText = () => {},
    onEvent = () => {},
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
            const callId = `local_${randomUUID()}`;
            onEvent({ type: "tool_call", name, callId, arguments: params });
            let result;
            try {
              result = normalizeToolResult(await tool.handler(params, { callId, signal }));
            } catch (error) {
              result = { ok: false, output: `Error: ${error?.message ?? String(error)}` };
            }
            if (result.handoff) throw new TierAdjustmentHandoff(result.handoff);
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
      const { history, prompt } = formatInput(input);
      if (history.length) session.setChatHistory([...session.getChatHistory(), ...history]);
      try {
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
        if (error instanceof TierAdjustmentHandoff) return { handoff: error.handoff };
        throw error;
      }
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

class TierAdjustmentHandoff extends Error {
  constructor(handoff) {
    super("Tier adjustment approved.");
    this.handoff = handoff;
  }
}

function formatInput(input) {
  if (!Array.isArray(input)) return { history: [], prompt: String(input ?? "") };
  const messages = [...input];
  const last = messages.at(-1);
  const prompt = last?.role === "user" ? String(messages.pop().content ?? "") : "";
  const history = [];
  const appendModel = (item) => {
    const last = history.at(-1);
    if (last?.type === "model") last.response.push(item);
    else history.push({ type: "model", response: [item] });
  };
  for (let i = 0; i < messages.length; i += 1) {
    const message = messages[i];
    if (message?.type === "tool_call" || message?.type === "tool_result") {
      // Pair only within a contiguous tool exchange, and reject ambiguous IDs.
      const block = [];
      while (i < messages.length && ["tool_call", "tool_result"].includes(messages[i]?.type)) {
        block.push(messages[i++]);
      }
      i -= 1;
      const calls = new Map();
      const results = new Map();
      for (const item of block) {
        const map = item.type === "tool_call" ? calls : results;
        if (item.callId) map.set(item.callId, [...(map.get(item.callId) ?? []), item]);
      }
      for (const item of block) {
        if (item.type !== "tool_call" || !item.callId || !item.name) continue;
        const matchingCalls = calls.get(item.callId);
        const matchingResults = results.get(item.callId);
        if (matchingCalls?.length !== 1 || matchingResults?.length !== 1) continue;
        const result = matchingResults[0];
        if (block.indexOf(result) < block.indexOf(item) || typeof result.ok !== "boolean") continue;
        appendModel({
          type: "functionCall",
          name: item.name,
          params: item.arguments ?? {},
          result: result.ok ? String(result.output ?? "") : `Error: ${String(result.output ?? "")}`,
        });
      }
    } else if (message?.role === "user" || message?.role === "assistant") {
      const content =
        typeof message.content === "string" ? message.content : JSON.stringify(message.content);
      if (message.role === "user") history.push({ type: "user", text: content ?? "" });
      else appendModel(content ?? "");
    }
  }
  return { history, prompt };
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
