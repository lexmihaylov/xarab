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
      "Delegate an isolated task to an agent with a clean context. Supply a complete brief including the user's constraints and only necessary selected context. The agent may edit files and run commands under existing application policy. MCP servers must be explicitly selected. Tasks cannot delegate further. Returns a bounded completion summary; cancellation does not undo side effects. Built-in agent: general-purpose. Project profiles: .agents/agents/<name>.md.",
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
      const result = await runner.run({
        mode: "agentic",
        brief,
        input: context,
        instructions: profile.instructions,
        mcpServers,
        signal,
        onProgress: (event) => onProgress({ ...event, callId }),
      });
      return {
        ok: result.status === "completed",
        output:
          result.status === "completed"
            ? result.value
            : `Task ${result.status}: ${result.error}${result.partial ? `\nPartial output (unfinished):\n${result.partial}` : ""}`,
      };
    },
  };
}
