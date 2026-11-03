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
      "Do work directly by default. Delegate only clearly bounded, independent tasks that benefit from isolation. Delegated agents have no parent history, so include all relevant constraints and context in the brief or selected context. Keep delegated work efficient by combining related tool operations where practical, and give concise tool-call summaries rather than routine narration. The agent runs with a clean context. The agent may edit files and run commands under existing application policy. MCP servers must be explicitly selected. Tasks cannot delegate further. Returns a bounded completion summary; cancellation does not undo side effects. Built-in agent: general-purpose. Project profiles: .agents/agents/<name>.md.",
    params: {
      type: "object",
      properties: {
        brief: { type: "string", description: "Task and applicable user constraints." },
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
