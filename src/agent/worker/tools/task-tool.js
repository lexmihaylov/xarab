import { discoverTaskAgents, isTaskAgentName } from "../../task-definitions.js";

export function createTaskTool({ runner, workspace, onProgress = () => {} }) {
  return {
    async catalog() {
      try {
        const { agents, diagnostics } = await discoverTaskAgents(workspace);
        const profiles = [...agents.values()]
          .slice(0, 32)
          .map(({ name, description }) => ({ name, description }));
        return diagnostics.length
          ? JSON.stringify({ profiles, diagnostics: diagnostics.slice(0, 32) })
          : JSON.stringify(profiles);
      } catch {
        return "Project profile discovery failed; task invocation is unavailable until the discovery error is resolved.";
      }
    },
    description:
      "Actively consider delegating clearly bounded, independent work that benefits from isolation, especially when multiple independent tasks can proceed in parallel; do work directly when delegation is not useful. To request parallel execution, issue adjacent task calls in the same response; concurrency depends on the provider and runtime and is not guaranteed. Delegate in parallel only independent work without overlapping file edits. Local workers may fail explicitly when the shared local runtime is busy. Delegated agents have no parent history, so include all relevant constraints and context in the brief or selected context, including the approved scope and whether implementation was explicitly approved. Delegation does not grant approval or bypass existing application policy or tool-specific authorization. Keep delegated work efficient by combining related tool operations where practical, and give concise tool-call summaries rather than routine narration. The agent runs with a clean context. The agent may edit files and run commands under existing application policy. MCP servers must be explicitly selected. Tasks cannot delegate further. Returns a bounded completion summary; cancellation does not undo side effects. Built-in agent: general-purpose. Project profiles: .agents/agents/<name>.md.",
    params: {
      type: "object",
      properties: {
        brief: {
          type: "string",
          description:
            "Task, applicable user constraints, approved plan scope, and whether the user explicitly approved implementation. Do not imply approval when absent.",
        },
        context: {
          type: "string",
          description: "Explicitly selected context; no automatic parent history.",
        },
        agent: { type: "string", description: "Profile name; defaults to general-purpose." },
        mcpServers: {
          type: "array",
          items: { type: "string" },
          description: "Selected configured MCP server names; defaults to none.",
        },
      },
      required: ["brief"],
      additionalProperties: false,
    },
    async handler(
      { brief, context = "", agent = "general-purpose", mcpServers = [] } = {},
      { signal, callId } = {},
    ) {
      if (!Array.isArray(mcpServers) || mcpServers.some((name) => typeof name !== "string"))
        throw new TypeError("Invalid MCP server selection.");
      if (!isTaskAgentName(agent)) throw new TypeError("Invalid task agent name.");
      const { agents, diagnostics } = await discoverTaskAgents(workspace);
      const profile = agents.get(agent);
      if (!profile) {
        const diagnostic = diagnostics.find((item) => item.name === agent);
        throw new Error(diagnostic?.message ?? `Unknown task agent: ${agent}`);
      }
      onProgress({ type: "profile", agent, callId });
      const result = await runner.run({
        mode: "agentic",
        brief,
        input: context,
        instructions: profile.instructions,
        mcpServers,
        signal,
        onProgress: (event) => onProgress({ ...event, callId }),
      });
      const diagnostic = result.diagnostics;
      const details = diagnostic
        ? `\nDiagnostics: phase=${diagnostic.phase}; elapsed=${diagnostic.elapsedMs}ms; approval=${diagnostic.approvalPending ? "pending" : "not pending"}${diagnostic.lastTool ? `; last tool=${diagnostic.lastTool.name} (${diagnostic.lastTool.outcome})` : ""}. Cancellation is cooperative; side effects may continue.`
        : "";
      return {
        ok: result.status === "completed",
        output:
          result.status === "completed"
            ? result.value
            : `Task ${result.status}: ${result.error}${details}${result.cleanupError ? `\n${result.cleanupError}` : ""}${result.partial ? `\nPartial output (unfinished):\n${result.partial}` : ""}`,
      };
    },
  };
}
