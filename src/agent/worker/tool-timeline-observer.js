export function createToolTimelineObserver({
  getMessages,
  getCurrentAgentMessage,
  sessionChanged,
  notify,
}) {
  return {
    async start(name, params, callId) {
      const part = {
        type: "tool",
        id: Symbol(name),
        ...(callId ? { callId } : {}),
        toolName: name,
        params: { ...(params ?? {}) },
        label: toolProgressLabel(name, params),
        title:
          name === "skill"
            ? `Loading skill: ${safeToolDetail(params?.name)}`
            : toolProgressLabel(name, params),
        summary: toolProgressSummary(name, params),
        status: "running",
        ...(name === "task" ? { taskStartedAt: Date.now() } : {}),
      };
      const message = getCurrentAgentMessage();
      const messages = getMessages();
      const preview =
        callId &&
        message?.parts.find(
          (entry) =>
            entry.type === "tool" &&
            entry.preview &&
            entry.status === "running" &&
            entry.callId === callId,
        );
      if (preview) {
        Object.assign(preview, part, { id: preview.id });
        delete preview.preview;
        delete preview.previewArguments;
      }
      if (message) {
        if (!messages.includes(message)) messages.push(message);
        if (!preview) message.parts.push(part);
        sessionChanged();
        notify();
        // Allow the UI to paint before starting the tool.
        await new Promise((resolve) => setImmediate(resolve));
      }
      return preview || part;
    },
    complete(part, name, params, result) {
      settleTaskActivity(part);
      if (part.toolName === "task") part.taskFinishedAt = Date.now();
      part.status = result.ok ? "complete" : "error";
      part.result = storedToolResult(result);
      const preservesEventSummary = name === "read_file" || name === "search_content";
      if (name === "task") part.title = result.ok ? "Task completed" : "Task did not complete";
      if (name === "skill" && result.ok) {
        part.title = `Loaded skill: ${safeToolDetail(params?.name)}`;
        part.summary = "";
      } else if (!result.ok || !preservesEventSummary || !part.summary) {
        part.summary = result.output;
      }
    },
    fail(part, result) {
      settleTaskActivity(part);
      if (part.toolName === "task") part.taskFinishedAt = Date.now();
      part.status = "error";
      part.result = storedToolResult(result);
      part.summary = result.output.slice(0, 240);
    },
    finish() {
      sessionChanged();
      notify();
    },
  };
}
function settleTaskActivity(part) {
  if (part.toolName !== "task" || !Array.isArray(part.taskActivity)) return;
  for (const item of part.taskActivity) {
    if (item.status === "running") item.status = "unknown";
  }
}
const MAX_STORED_TOOL_OUTPUT = 16 * 1024;

function storedToolResult(result) {
  const output = result.output.slice(0, MAX_STORED_TOOL_OUTPUT);
  return {
    ok: result.ok,
    output:
      output.length < result.output.length
        ? `${output}\n[Tool output truncated for session history.]`
        : output,
    ...(output.length < result.output.length ? { truncated: true } : {}),
    ...(result.errorCode ? { errorCode: result.errorCode } : {}),
  };
}

function safeToolDetail(value) {
  return String(value ?? "")
    .replace(
      /[\u0000-\u001f\u007f]/g,
      (character) => `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`,
    )
    .slice(0, 100);
}

export function toolProgressLabel(name, params = {}) {
  if (name === "ask_questions") return "Asking user questions";
  if (name === "run_command") return `Executing ${safeToolDetail(params.command)}`;
  if (name === "read_file") return `Reading ${safeToolDetail(params.path)}`;
  if (name === "list_files") return `Listing ${safeToolDetail(params.path || ".")}`;
  if (name === "search_files") return `Searching filenames for “${safeToolDetail(params.query)}”`;
  if (name === "search_content")
    return `Searching file contents for “${safeToolDetail(params.query)}”`;
  if (name === "edit") return `Editing ${safeToolDetail(params.path)}`;
  if (name === "insert_before") return `Inserting before anchor in ${safeToolDetail(params.path)}`;
  if (name === "insert_after") return `Inserting after anchor in ${safeToolDetail(params.path)}`;
  if (name === "write") return `Writing ${safeToolDetail(params.path)}`;
  if (name === "websearch") return `Searching the web for “${safeToolDetail(params.query)}”`;
  if (name === "webfetch") return `Fetching ${safeToolDetail(params.url)}`;
  if (name === "generate_image") return `Generating image in ${safeToolDetail(params.folder)}`;
  if (name === "edit_image") return `Editing ${safeToolDetail(params.path)}`;
  if (name === "analyze_image") return `Analyzing ${safeToolDetail(params.path)}`;
  return `Running ${name}`;
}

function toolProgressSummary(name, params = {}) {
  if (name === "run_command") return safeToolDetail(params.command);
  return undefined;
}
