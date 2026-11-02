import { createTaskRunner } from "./task-runner.js";
import { createSessionTitleTask } from "./session-title-task.js";
import { createTaskTool } from "./worker/tools/task-tool.js";

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
      sessionChanged();
      notify();
    },
  });

  return {
    taskTool,
    onFirstUserMessage(message, session) {
      if (titlesEnabled()) void titleTask.start(message, session);
    },
    cancelTitle: () => titleTask.cancel(),
    shutdown: () => runner.shutdown(),
  };
}
