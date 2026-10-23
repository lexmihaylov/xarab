import { buildSystemPrompt } from "./instructions.js";
import { createTierAdjustmentTool } from "./tools/tier-adjustment-tool.js";
import { createToolRegistry } from "./tool-registry.js";
import { discoverSkills } from "./skills.js";

export function createWorker({
  configStore,
  openAIAdapterFactory,
  localAdapterFactory,
  getCredentials,
  workspace,
  instructionFiles,
  toolRuntime,
}) {
  if (!configStore || typeof configStore.getTierWorker !== "function")
    throw new TypeError("A worker config store is required.");
  if (typeof openAIAdapterFactory !== "function")
    throw new TypeError("An OpenAI adapter factory is required.");
  if (typeof localAdapterFactory !== "function")
    throw new TypeError("A local adapter factory is required.");

  const adapters = new Map();

  function getAssignment(tier) {
    if (tier == null) {
      const model = configStore.getOpenAIModel();
      return model ? { provider: "openai", model } : undefined;
    }
    return configStore.getTierWorker(tier);
  }

  function validateAssignment(assignment) {
    if (!assignment || !["openai", "local"].includes(assignment.provider)) return false;
    return Boolean(assignment.model);
  }

  async function getAdapter(assignment) {
    const key = `${assignment.provider}:${assignment.model}`;
    for (const [cachedKey, adapter] of adapters) {
      if (cachedKey === key) continue;
      adapters.delete(cachedKey);
      await adapter.dispose?.();
    }
    if (adapters.has(key)) return adapters.get(key);
    const adapter =
      assignment.provider === "openai"
        ? openAIAdapterFactory({ getCredentials })
        : localAdapterFactory();
    if (!adapter || typeof adapter.run !== "function")
      throw new TypeError(`The ${assignment.provider} worker adapter must have a run method.`);
    adapters.set(key, adapter);
    return adapter;
  }

  const registryOptions = {
    workspace,
    configStore,
    onToolEvent: toolRuntime?.onToolEvent ?? (() => {}),
    getMessages: toolRuntime?.getMessages ?? (() => []),
    getCurrentAgentMessage: toolRuntime?.getCurrentAgentMessage ?? (() => undefined),
    sessionChanged: toolRuntime?.sessionChanged ?? (() => {}),
    notify: toolRuntime?.notify ?? (() => {}),
  };

  function systemPromptFor(tier, tierAdjustmentTool, definitions) {
    const toolDescriptions = Object.entries(definitions).map(([name, definition]) => ({
      name,
      description: definition.description,
    }));
    const prompt = buildSystemPrompt({
      workspace,
      instructionFiles,
      availableTools: [
        ...toolDescriptions,
        ...(tierAdjustmentTool
          ? [{ name: "tier_adjustment", description: tierAdjustmentTool.description }]
          : []),
      ],
    });
    if (!tierAdjustmentTool) return prompt;
    return `${prompt}\n\n## Tier adjustment\nRequest tier adjustment only after investigation gives concrete evidence that the remaining work needs materially more capability or is routine enough for a lower tier. Do not use it merely because work is long or tools are needed. Request a capability, never a model or tier. If the request is not applied, continue at the current tier and do not repeat it for the same reason.`;
  }

  async function execute({ tier, instructions, input, tools, ...request }) {
    const assignment = getAssignment(tier);
    if (!validateAssignment(assignment)) {
      throw new Error(
        tier == null
          ? "Choose an OpenAI model first."
          : `Tier ${tier} is not configured; choose a worker model in /route.`,
      );
    }
    return (await getAdapter(assignment)).run({
      ...request,
      input,
      model: assignment.model,
      ...(instructions ? { instructions } : {}),
      ...(tools ? { tools } : {}),
    });
  }

  async function run({ tier, history, input, onTierAdjustment, ...request }) {
    const skills = await discoverSkills(workspace);
    const { definitions, tools } = createToolRegistry({ ...registryOptions, skills });
    const tierAdjustmentTool = createTierAdjustmentTool({
      activeTier: tier,
      requestAdjustment: onTierAdjustment,
    });
    return execute({
      ...request,
      tier,
      input: buildWorkerHistory(history, input),
      instructions: systemPromptFor(tier, tierAdjustmentTool, definitions),
      tools: { ...tools, tier_adjustment: tierAdjustmentTool },
    });
  }

  function complete({ tier, instructions, input, ...request }) {
    return execute({ ...request, tier, instructions, input, tools: {} });
  }

  function getTierInfo(tier) {
    const assignment = getAssignment(tier);
    return {
      configured: validateAssignment(assignment),
      model: assignment?.model,
    };
  }

  async function dispose() {
    await Promise.all([...adapters.values()].map((adapter) => adapter.dispose?.()));
    adapters.clear();
  }

  return { run, complete, getTierInfo, dispose };
}

const MAX_REPLAY_TOOL_OUTPUT = 64 * 1024;

export function buildWorkerHistory(messages = [], currentInput) {
  const history = [];
  const replayableToolParts = selectReplayableToolParts(messages);
  for (const message of messages ?? []) {
    if (message?.type === "user" && message.message?.trim()) {
      history.push({ role: "user", content: message.message });
      continue;
    }
    if (message?.type !== "agent") continue;
    const parts = Array.isArray(message.parts) && message.parts.length ? message.parts : null;
    if (!parts) {
      if (message.message?.trim()) history.push({ role: "assistant", content: message.message });
      continue;
    }
    for (const part of parts) {
      if (part.type === "text" && part.text) {
        history.push({ role: "assistant", content: part.text });
        continue;
      }
      if (part.type !== "tool" || !part.callId || !part.toolName) continue;
      // Keep call/result records paired. In particular, interrupted calls have no
      // result and must not be replayed as dangling function calls.
      if (!replayableToolParts.has(part)) continue;
      history.push({
        type: "tool_call",
        callId: part.callId,
        name: part.toolName,
        arguments: part.params ?? {},
      });
      const output = String(part.result.output ?? "");
      history.push({
        type: "tool_result",
        callId: part.callId,
        output,
        ok: part.result.ok,
      });
    }
  }
  if (currentInput !== undefined && currentInput !== null)
    history.push({ role: "user", content: String(currentInput) });
  return history;
}

function selectReplayableToolParts(messages) {
  const candidates = [];
  for (const message of messages ?? []) {
    if (message?.type !== "agent" || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (part?.type !== "tool" || !part.callId || !part.toolName || !part.result) continue;
      candidates.push(part);
    }
  }

  // Spend the aggregate replay budget on the newest complete exchanges first,
  // then restore chronological order when building the transcript.
  const selected = new Set();
  let remaining = MAX_REPLAY_TOOL_OUTPUT;
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const part = candidates[index];
    const output = String(part.result.output ?? "");
    const outputBytes = Buffer.byteLength(output);
    if (outputBytes > remaining) continue;
    selected.add(part);
    remaining -= outputBytes;
  }
  return selected;
}
