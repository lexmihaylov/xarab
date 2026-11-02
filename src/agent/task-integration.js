import { createTaskRunner } from "./task-runner.js";
import { createSessionTitleTask } from "./session-title-task.js";
import { createTaskTool } from "./worker/tools/task-tool.js";
import { COMMAND_RISK_INSTRUCTIONS, parseCommandRisk } from "./command-risk.js";

export function createTaskIntegration({
  workspace,
  classify,
  createWorker,
  getSession,
  applyTitle,
  warn,
  getCurrentAgentMessage,
  sessionChanged,
  notify,
  titlesEnabled,
}) {
  const runner = createTaskRunner({ classify, createWorker });
  const validationRunner = createTaskRunner({
    classify,
    createWorker: (options) => createWorker({ ...options, mode: "validation" }),
    timeoutMs: 15_000,
  });
  const titleTask = createSessionTitleTask({ runner, getSession, applyTitle, warn });
  const taskTool = createTaskTool({
    runner,
    workspace,
    onProgress(event) {
      const part = getCurrentAgentMessage()?.parts?.findLast(
        (part) =>
          part.toolName === "task" &&
          part.status === "running" &&
          (!event.callId || part.callId === event.callId),
      );
      if (!part) return;
      if (event.type === "text")
        part.summary = `${part.summary ?? ""}${event.text}`.slice(-16 * 1024);
      else if (event.type === "status") part.title = `Task ${event.status}`;
      else if (event.type === "tool") part.title = `Task: ${event.name}`;
      else if (event.type === "assignment")
        part.taskExecution = `Tier ${event.tier} · ${event.provider} · ${event.model}`;
      sessionChanged();
      notify();
    },
  });

  return {
    taskTool,
    async assessCommand({ command, workspace, signal }) {
      const result = await validationRunner.run({
        mode: "utility",
        brief: "Assess shell command risk.",
        input: JSON.stringify({ workspace, command }),
        instructions: COMMAND_RISK_INSTRUCTIONS,
        parse: parseCommandRisk,
        signal,
      });
      if (result.status !== "completed") throw new Error("Command validation failed.");
      return result.value;
    },
    onFirstUserMessage(message, session) {
      if (titlesEnabled()) void titleTask.start(message, session);
    },
    cancelTitle: () => titleTask.cancel(),
    shutdown: () => Promise.all([runner.shutdown(), validationRunner.shutdown()]),
  };
}
