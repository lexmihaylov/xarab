import { createReadFileTool } from "./tools/read-file-tool.js";
import { createListFilesTool } from "./tools/list-files-tool.js";
import { createSearchFilesTool } from "./tools/search-files-tool.js";
import { createSearchContentTool } from "./tools/search-content-tool.js";
import { createEditTool } from "./tools/edit-tool.js";
import { createInsertTool } from "./tools/insert-tool.js";
import { createWriteTool } from "./tools/write-tool.js";
import { createWebsearchTool } from "./tools/web-search-tool.js";
import { createWebfetchTool } from "./tools/web-fetch-tool.js";
import { createShellTool } from "./tools/shell-tool.js";

export function createToolRegistry({
  workspace,
  configStore,
  onToolEvent,
  getMessages,
  getCurrentAgentMessage,
  sessionChanged,
  notify,
}) {
  const definitions = {
    read_file: createReadFileTool({
      workspace,
      onEvent: (event) => onToolEvent("read_file", event),
    }),
    list_files: createListFilesTool({
      workspace,
      onEvent: (event) => onToolEvent("list_files", event),
    }),
    search_files: createSearchFilesTool({
      workspace,
      onEvent: (event) => onToolEvent("search_files", event),
    }),
    search_content: createSearchContentTool({
      workspace,
      onEvent: (event) => onToolEvent("search_content", event),
    }),
    edit: createEditTool({ workspace, onEvent: (event) => onToolEvent("edit", event) }),
    insert_before: createInsertTool({
      workspace,
      position: "before",
      onEvent: (event) => onToolEvent("insert_before", event),
    }),
    insert_after: createInsertTool({
      workspace,
      position: "after",
      onEvent: (event) => onToolEvent("insert_after", event),
    }),
    write: createWriteTool({ workspace, onEvent: (event) => onToolEvent("write", event) }),
    websearch: createWebsearchTool({
      getApiKey: () => process.env.TAVILY_API_KEY?.trim() || configStore.getApiKey("tavily"),
      onEvent: (event) => onToolEvent("websearch", event),
    }),
    webfetch: createWebfetchTool({
      onEvent: (event) => onToolEvent("webfetch", event),
    }),
    run_command: createShellTool({
      workspace,
      onEvent: (event) => onToolEvent("run_command", event),
    }),
  };

  const tools = Object.fromEntries(
    Object.entries(definitions).map(([name, definition]) => [
      name,
      {
        ...definition,
        async handler(params) {
          const part = {
            type: "tool",
            id: Symbol(name),
            toolName: name,
            params: { ...(params ?? {}) },
            label: toolProgressLabel(name, params),
            title: toolProgressLabel(name, params),
            summary: toolProgressSummary(name, params),
            status: "running",
          };
          const currentAgentMessage = getCurrentAgentMessage();
          const messages = getMessages();
          if (currentAgentMessage) {
            // Attach the assistant timeline as soon as a tool starts. Tool calls
            // can happen before the model emits its first text token, so waiting
            // for appendAssistantText() makes the running tool invisible.
            if (!messages.includes(currentAgentMessage)) messages.push(currentAgentMessage);
            currentAgentMessage.parts.push(part);
            sessionChanged();
            notify();
            // Let the UI paint the running tool card before the handler starts.
            await new Promise((resolve) => setImmediate(resolve));
          }
          try {
            const rawResult = await definition.handler(params);
            const result = normalizeToolResult(rawResult);
            part.status = result.ok ? "complete" : "error";
            part.result = storedToolResult(result);
            // These tools emit concise UI summaries separately; keep their full
            // result payload available to the model without rendering it in chat.
            const preservesEventSummary = name === "read_file" || name === "search_content";
            if (!result.ok || !preservesEventSummary || !part.summary) part.summary = result.output;
            return result;
          } catch (error) {
            const result = {
              ok: false,
              output: `Error: ${error?.message ?? String(error)}`,
              errorCode: error?.code,
            };
            part.status = "error";
            part.result = storedToolResult(result);
            part.summary = result.output.slice(0, 240);
            return result;
          } finally {
            sessionChanged();
            notify();
          }
        },
      },
    ]),
  );

  return { definitions, tools };
}

function normalizeToolResult(result) {
  if (result && typeof result === "object" && typeof result.ok === "boolean") {
    return {
      ...result,
      output: String(result.output ?? ""),
    };
  }
  const serialized = typeof result === "string" ? result : JSON.stringify(result);
  const output = serialized === undefined ? String(result) : serialized;
  const failed = /^\s*(?:error|failed|failure)\s*:/i.test(output);
  return { ok: !failed, output };
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

function toolProgressLabel(name, params = {}) {
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
  return `Running ${name}`;
}

function toolProgressSummary(name, params = {}) {
  if (name === "run_command") return safeToolDetail(params.command);
  return undefined;
}
