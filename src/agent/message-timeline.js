import { getTheme } from "../utils/theme-engine.js";

export function createMessageTimeline({
  getMessages,
  getCurrentAgentMessage,
  getActiveSession,
  sessionChanged,
  notify,
}) {
  function addMessage({
    type,
    message,
    severity = "info",
    classification,
    command,
    running = false,
  }) {
    const theme = getTheme();
    const color =
      type === "system" && severity === "warning"
        ? theme.colors.warning
        : type === "system" && severity === "error"
          ? theme.colors.error
          : theme.messages[type];
    const entry = {
      type,
      message,
      severity,
      color,
      ...(command !== undefined ? { command } : {}),
      ...(classification ? { classification } : {}),
      ...(running ? { running: true } : {}),
    };
    const messages = getMessages();
    messages.push(entry);
    const activeSession = getActiveSession();
    if (type === "user" && !activeSession.manualTitle && activeSession.title === "New session")
      activeSession.title =
        message
          .replace(/[\u0000-\u001f\u007f]/g, " ")
          .trim()
          .slice(0, 80) || "New session";
    sessionChanged();
    notify();
    return entry;
  }

  function appendAssistantText(chunk) {
    const activeMessage = getCurrentAgentMessage();
    if (!activeMessage) return;
    const messages = getMessages();
    if (!messages.includes(activeMessage)) messages.push(activeMessage);
    activeMessage.message += chunk;
    const lastPart = activeMessage.parts.at(-1);
    if (lastPart?.type === "text") lastPart.text += chunk;
    else activeMessage.parts.push({ type: "text", text: chunk });
    sessionChanged();
    notify();
  }

  function findActiveToolPart(toolName, event) {
    const active =
      getCurrentAgentMessage()?.parts?.filter(
        (part) => part.type === "tool" && part.toolName === toolName && part.status === "running",
      ) ?? [];
    const field = event.query !== undefined ? "query" : event.path !== undefined ? "path" : null;
    const match =
      field &&
      active.findLast(
        (part) =>
          String(part.params?.[field] ?? (field === "path" ? "." : "")) === String(event[field]),
      );
    return match ?? active.at(-1);
  }

  function onToolEvent(toolName, event) {
    const part = findActiveToolPart(toolName, event);
    if (!part) {
      if (event.type === "denied")
        addMessage({
          type: "system",
          message: `${toolName} denied: ${event.path} is outside the workspace.`,
          severity: "warning",
        });
      else
        addMessage({
          type: "system",
          message: `${toolName} failed for ${event.path}: ${event.message}`,
          severity: "error",
        });
      return;
    }

    if (event.type === "tool_call") {
      if (typeof event.callId === "string" && event.callId) part.callId = event.callId;
    } else if (event.type === "edited") {
      part.title = "File edit";
      part.summary = event.action
        ? "1 anchor insertion"
        : `${event.replacements} replacement${event.replacements === 1 ? "" : "s"}`;
      part.diffText = event.diffText;
      part.status = "complete";
    } else if (event.type === "written") {
      part.title = `${event.created ? "Created" : "Wrote"} ${event.path}`;
      part.summary = `${event.bytes} bytes`;
      part.diffText = event.diffText;
      part.status = "complete";
    } else if (event.type === "read") {
      part.status = "complete";
      const linesRead = event.endLine - event.offset + 1;
      const limit = event.limit ?? linesRead;
      part.summary = `Offset ${event.offset}, limit ${limit}, ${event.bytes} bytes read${event.truncated ? `. More content available; continue with offset: ${event.nextOffset}.` : "."}`;
    } else if (event.type === "listed") {
      part.status = "complete";
      part.summary = `Listed ${event.path} (${event.entries} entries${event.truncated ? ", truncated" : ""})`;
    } else if (event.type === "searched" && toolName === "search_files") {
      part.status = "complete";
      part.summary = `Found ${event.results} filename matches in ${event.path}${event.truncated ? " (limited)" : ""}`;
    } else if (event.type === "searched" && toolName === "websearch") {
      part.status = "complete";
      part.summary = `Found ${event.results} web results`;
    } else if (event.type === "fetched" && toolName === "webfetch") {
      part.status = "complete";
      part.summary = `Fetched ${event.bytes} bytes${event.truncated ? " (truncated)" : ""}`;
    } else if (event.type === "searched") {
      part.status = "complete";
      part.summary = `Found ${event.results} content matches in ${event.files} files${event.truncated ? " (limited)" : ""}`;
    } else if (event.type === "denied" && toolName === "websearch") {
      part.status = "complete";
      part.title = "Web search not run";
      part.summary = event.reason;
    } else if (event.type === "denied" && toolName === "webfetch") {
      part.status = "complete";
      part.title = "Web fetch not run";
      part.summary = event.reason;
    } else if (event.type === "started") {
      part.title = `Executing ${safeToolDetail(event.command)}`;
    } else if (event.type === "completed") {
      part.status = event.code === 0 && !event.error && !event.timedOut ? "complete" : "error";
      if (event.timedOut) part.title = `Execution timed out: ${safeToolDetail(event.command)}`;
      else if (part.status === "error")
        part.title = `Execution failed: ${safeToolDetail(event.command)}`;
      part.summary =
        [event.stdout, event.stderr, event.truncated ? "Output truncated." : ""]
          .filter(Boolean)
          .join("\n")
          .slice(0, 240) || "No output";
    } else if (event.type === "denied" && toolName === "run_command") {
      part.status = "complete";
      part.title = "Command not run";
      part.summary = event.reason;
    } else {
      part.status = "error";
      part.title = event.type === "denied" ? `Blocked ${part.label}` : `${part.label} failed`;
      part.summary = event.message ?? `Path is outside the workspace: ${event.path}`;
    }
    sessionChanged();
    notify();
  }

  return { addMessage, appendAssistantText, onToolEvent };
}

function safeToolDetail(value) {
  return String(value ?? "")
    .replace(
      /[\u0000-\u001f\u007f]/g,
      (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    )
    .slice(0, 100);
}
