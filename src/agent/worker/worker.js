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

  async function run({ tier, tools, ...request }) {
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
