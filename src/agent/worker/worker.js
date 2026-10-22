import { buildSystemPrompt } from "./instructions.js";

export function createWorker({
  configStore,
  openAIAdapterFactory,
  localAdapterFactory,
  getCredentials,
  workspace,
  instructionFiles,
  availableTools,
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

  function getAdapter(assignment) {
    const key = `${assignment.provider}:${assignment.model}`;
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

  const systemPrompt =
    workspace || instructionFiles || availableTools
      ? buildSystemPrompt({ workspace, instructionFiles, availableTools })
      : "";

  function escalationInstructions(tier, canEscalate) {
    if (!canEscalate) return "";
    return `\n\n## Escalation\nYou are working at Tier ${tier}. If investigation reveals that the overall task or any individual subtask, component, or dependency requires the next tier, call request_escalation before making consequential changes. You may escalate for one subtask even when the rest of the request is manageable. State concrete findings, not speculation. It can only request Tier ${tier + 1}, ends your run immediately, and transfers your findings to that worker. Do not call it merely because tools are needed, and do not write a final answer after calling it.`;
  }

  async function run({ tier, tools, history, input, ...request }) {
    const assignment = getAssignment(tier);
    if (!validateAssignment(assignment)) {
      throw new Error(
        tier == null
          ? "Choose an OpenAI model first."
          : `Tier ${tier} is not configured; choose a worker model in /route.`,
      );
    }
    const instructions = `${systemPrompt}${escalationInstructions(tier, Boolean(tools?.request_escalation))}`;
    return getAdapter(assignment).run({
      ...request,
      input: buildWorkerHistory(history, input),
      model: assignment.model,
      ...(instructions ? { instructions } : {}),
      ...(tools ? { tools } : {}),
    });
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

  return { run, getTierInfo, dispose };
}

const MAX_REPLAY_TOOL_OUTPUT = 64 * 1024;

export function buildWorkerHistory(messages = [], currentInput) {
  const history = [];
  let replayedOutput = 0;
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
      history.push({
        type: "tool_call",
        callId: part.callId,
        name: part.toolName,
        arguments: part.params ?? {},
      });
      if (!part.result) continue;
      const remaining = MAX_REPLAY_TOOL_OUTPUT - replayedOutput;
      if (remaining <= 0) continue;
      const output = part.result.output.slice(0, remaining);
      replayedOutput += output.length;
      history.push({
        type: "tool_result",
        callId: part.callId,
        output:
          output.length < part.result.output.length
            ? `${output}\n[Tool output omitted because the conversation replay limit was reached.]`
            : output,
        ok: part.result.ok,
      });
    }
  }
  if (currentInput !== undefined && currentInput !== null)
    history.push({ role: "user", content: String(currentInput) });
  return history;
}
