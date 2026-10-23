import WebSocket from "ws";

const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const RESPONSES_URL = `${CODEX_BASE_URL}/responses`;
const WEBSOCKET_RESPONSES_URL = RESPONSES_URL.replace(/^https:/, "wss:");
const MODELS_URL = new URL(`${CODEX_BASE_URL}/models`);
MODELS_URL.searchParams.set("client_version", "0.0.0");
const KNOWN_CODEX_MODELS = [
  { id: "gpt-6-astra", name: "GPT-6 Astra" },
  { id: "gpt-6-astra-fast", name: "GPT-6 Astra Fast" },
  { id: "gpt-6-luna", name: "GPT-6 Luna" },
  { id: "gpt-6-luna-fast", name: "GPT-6 Luna Fast" },
  { id: "gpt-6-sol", name: "GPT-6 Sol" },
  { id: "gpt-6-sol-fast", name: "GPT-6 Sol Fast" },
  { id: "gpt-6.1-sol", name: "GPT-6.1 Sol" },
  { id: "gpt-6.1-sol-fast", name: "GPT-6.1 Sol Fast" },
];

export function createOpenAIResponsesWorkerAdapter({
  getCredentials,
  fetchImpl = fetch,
  webSocketFactory = (url, options) => new WebSocket(url, options),
}) {
  async function listModels({ signal } = {}) {
    const credentials = await getCredentials();
    const response = await fetchImpl(MODELS_URL, {
      headers: codexHeaders(credentials, { accept: "application/json" }),
      signal,
    });
    if (!response.ok) throw await responseError(response, "list OpenAI models");
    const body = await response.json();
    const entries = Array.isArray(body) ? body : (body.models ?? []);
    const models = new Map(
      entries
        .filter((model) => model.slug || model.model_slug || model.id)
        .map((model) => {
          const id = model.slug ?? model.model_slug ?? model.id;
          return [id, { id, name: model.display_name || model.name || id }];
        }),
    );
    for (const model of KNOWN_CODEX_MODELS) {
      if (!models.has(model.id)) models.set(model.id, model);
    }
    return [...models.values()];
  }

  async function run({
    model,
    instructions,
    input,
    tools = {},
    sessionID,
    signal,
    onText = () => {},
    onTextDelta,
    onEvent = () => {},
  }) {
    if (!model) throw new Error("Choose an OpenAI model first.");
    const credentials = await getCredentials();
    const apiTools = Object.entries(tools).map(([name, tool]) => ({
      type: "function",
      name,
      description: tool.description,
      parameters: tool.params ?? { type: "object", properties: {} },
      strict: false,
    }));
    let requestInput = serializeWorkerInput(input);
    let completedResponse;
    let sawToolCall = false;
    let socket;
    let previousResponseId;
    let pendingToolOutputs = [];
    let useWebSocket = Boolean(sessionID);

    if (useWebSocket) {
      try {
        socket = await openResponsesWebSocket({
          webSocketFactory,
          credentials,
          sessionID,
          signal,
        });
      } catch (error) {
        if (signal?.aborted) throw abortError();
        useWebSocket = false;
      }
    }

    try {
      while (true) {
        if (signal?.aborted) throw abortError();
        const requestBody = {
          model,
          instructions,
          input: requestInput,
          tools: apiTools,
          parallel_tool_calls: true,
          reasoning: {
            effort: "low",
            summary: "auto",
          },
          store: false,
          include: ["reasoning.encrypted_content"],
        };
        let streamedChunks;
        let streamedText;
        if (useWebSocket) {
          try {
            const body = previousResponseId
              ? {
                  ...requestBody,
                  input: pendingToolOutputs,
                  previous_response_id: previousResponseId,
                }
              : requestBody;
            ({
              response: completedResponse,
              streamedChunks,
              streamedText,
            } = await requestOverWebSocket(socket, body, {
              onText,
              onTextDelta,
              onEvent,
              signal,
            }));
          } catch (error) {
            if (signal?.aborted) throw abortError();
            if (!error.webSocketFallback || error.outputStarted) throw error;
            useWebSocket = false;
            socket?.terminate();
            socket = undefined;
            continue;
          }
        } else {
          const response = await fetchImpl(RESPONSES_URL, {
            method: "POST",
            headers: codexHeaders(credentials, {
              "content-type": "application/json",
              accept: "text/event-stream",
              "openai-beta": "responses=experimental",
            }),
            body: JSON.stringify({ ...requestBody, stream: true }),
            signal,
          });
          if (!response.ok) throw await responseError(response, "OpenAI Responses request");
          streamedChunks = [];
          streamedText = "";
          completedResponse = await readResponseStream(response, {
            onText(chunk) {
              streamedChunks.push(chunk);
            },
            onTextDelta: onTextDelta
              ? (chunk) => {
                  streamedText += chunk;
                  onTextDelta(chunk);
                }
              : undefined,
            onEvent,
            signal,
          });
        }
        if (!completedResponse?.output || !Array.isArray(completedResponse.output))
          throw new Error("OpenAI stream completed without a response output.");

        const functionCalls = completedResponse.output.filter(
          (item) => item.type === "function_call",
        );
        if (functionCalls.length === 0) {
          const outputText = responseOutputText(completedResponse);
          if (isTextualToolCall(`${streamedChunks.join("")}\n${outputText}`))
            throw new Error(
              "OpenAI returned a textual tool call instead of a structured function call.",
            );
          // When deltas were supplied, text has already been forwarded during
          // streaming. Some Responses API completions still include the final
          // text only in `response.output`, so forward it only if no delta arrived.
          if (onTextDelta) {
            if (!streamedText && outputText) onTextDelta(outputText);
            else if (!streamedText && !outputText && sawToolCall)
              throw new Error(
                "OpenAI completed the turn after a tool call without a text response.",
              );
          } else if (streamedChunks.length) streamedChunks.forEach(onText);
          else if (outputText) onText(outputText);
          else if (sawToolCall)
            throw new Error("OpenAI completed the turn after a tool call without a text response.");
          return completedResponse;
        }
        const functionOutputs = [];
        sawToolCall = true;
        for (const call of functionCalls) {
          if (signal?.aborted) throw abortError();
          const tool = tools[call.name];
          if (!tool || typeof tool.handler !== "function") {
            functionOutputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: `Error: tool ${String(call.name)} is unavailable.`,
            });
            continue;
          }
          let args;
          try {
            args = JSON.parse(call.arguments || "{}");
          } catch {
            functionOutputs.push({
              type: "function_call_output",
              call_id: call.call_id,
              output: "Error: tool arguments were invalid JSON.",
            });
            continue;
          }
          onEvent({ type: "tool_call", name: call.name, callId: call.call_id, arguments: args });
          let result;
          try {
            result = normalizeToolResult(
              await tool.handler(args, { callId: call.call_id, signal }),
            );
          } catch (error) {
            result = {
              ok: false,
              output: `Error: ${error?.message ?? String(error)}`,
              errorCode: error?.code,
            };
          }
          onEvent({
            type: "tool_result",
            name: call.name,
            callId: call.call_id,
            ok: result.ok,
            errorCode: result.errorCode,
          });
          if (result.handoff) return { handoff: result.handoff };
          functionOutputs.push({
            type: "function_call_output",
            call_id: call.call_id,
            output: result.output,
          });
        }
        requestInput = [
          ...(Array.isArray(requestInput)
            ? requestInput
            : [{ role: "user", content: requestInput }]),
          ...completedResponse.output,
          ...functionOutputs,
        ];
        if (useWebSocket) {
          if (!completedResponse.id) {
            useWebSocket = false;
            socket?.terminate();
            socket = undefined;
          } else {
            previousResponseId = completedResponse.id;
            pendingToolOutputs = functionOutputs;
          }
        }
      }
    } finally {
      socket?.close();
    }
  }

  return { listModels, run };
}

async function readResponseStream(response, { onText, onTextDelta, onEvent, signal }) {
  if (!response.body?.getReader) throw new Error("OpenAI response did not provide a stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed;

  const handleEventBlock = (block) => {
    const data = block
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trimStart())
      .join("\n");
    if (!data || data === "[DONE]") return;
    let event;
    try {
      event = JSON.parse(data);
    } catch {
      throw new Error("OpenAI returned a malformed streaming event.");
    }
    if (event.type === "response.output_text.delta") {
      const delta = event.delta ?? "";
      onTextDelta?.(delta);
      if (!onTextDelta) onText(delta);
    } else if (event.type === "response.completed" || event.type === "response.done")
      completed = event.response;
    else if (event.type === "response.failed") {
      const error = event.response?.error;
      throw new Error(`OpenAI response failed (${error?.code ?? "unknown_error"}).`);
    } else if (event.type === "response.incomplete") {
      throw new Error(
        `OpenAI response was incomplete (${event.response?.incomplete_details?.reason ?? "unknown reason"}).`,
      );
    } else if (event.type === "error") {
      // The Responses API places streaming error details in `error`; retain
      // compatibility with older flat event payloads as well.
      const error = event.error ?? event;
      const code = error?.code ?? "unknown_error";
      const message = typeof error?.message === "string" ? error.message.trim() : "";
      throw new Error(`OpenAI stream failed (${code})${message ? `: ${message}` : "."}`);
    }
    onEvent(event);
  };

  try {
    while (true) {
      if (signal?.aborted) throw abortError();
      const { value, done } = await reader.read();
      buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
      let separator;
      while ((separator = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const block = buffer.slice(0, separator);
        const delimiter = buffer.slice(separator).match(/^\r?\n\r?\n/)[0];
        buffer = buffer.slice(separator + delimiter.length);
        handleEventBlock(block);
      }
      if (done) break;
    }
    if (buffer.trim()) handleEventBlock(buffer);
  } finally {
    reader.releaseLock?.();
  }
  if (!completed) throw new Error("OpenAI stream ended without response.completed.");
  return completed;
}

async function openResponsesWebSocket({ webSocketFactory, credentials, sessionID, signal }) {
  if (signal?.aborted) throw abortError();
  const socket = webSocketFactory(WEBSOCKET_RESPONSES_URL, {
    handshakeTimeout: 15_000,
    headers: codexHeaders(credentials, {
      "openai-beta": "responses_websockets=2026-02-06",
      "x-session-affinity": sessionID,
    }),
  });
  await new Promise((resolve, reject) => {
    const cleanup = () => {
      socket.removeListener("open", onOpen);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    const onOpen = () => {
      cleanup();
      resolve();
    };
    const onError = (error) => {
      cleanup();
      reject(webSocketError(error));
    };
    const onClose = () => {
      cleanup();
      reject(webSocketError());
    };
    const onAbort = () => {
      cleanup();
      socket.terminate();
      reject(abortError());
    };
    socket.once("open", onOpen);
    socket.once("error", onError);
    socket.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  return socket;
}

function requestOverWebSocket(socket, body, { onText, onTextDelta, onEvent, signal }) {
  return new Promise((resolve, reject) => {
    let completed;
    let streamedText = "";
    let outputStarted = false;
    const streamedChunks = [];
    const cleanup = () => {
      socket.removeListener("message", onMessage);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
      signal?.removeEventListener("abort", onAbort);
    };
    const fail = (error) => {
      cleanup();
      if (error && typeof error === "object") error.outputStarted = outputStarted;
      reject(error);
    };
    const onError = (error) => fail(webSocketError(error));
    const onClose = () => fail(webSocketError());
    const onAbort = () => fail(abortError());
    const onMessage = (data) => {
      try {
        const event = JSON.parse(data.toString());
        if (event.type === "response.output_text.delta") {
          outputStarted = true;
          const text = event.delta ?? "";
          streamedText += text;
          streamedChunks.push(text);
          if (onTextDelta) onTextDelta(text);
        }
        if (event.type === "response.failed" || event.type === "error") {
          const detail = event.response?.error ?? event.error ?? {};
          throw new Error(`OpenAI WebSocket response failed (${detail.code ?? "unknown_error"}).`);
        }
        if (event.type === "response.incomplete")
          throw new Error(
            `OpenAI WebSocket response was incomplete (${event.response?.incomplete_details?.reason ?? "unknown reason"}).`,
          );
        onEvent(event);
        if (event.type === "response.completed" || event.type === "response.done") {
          completed = event.response;
          cleanup();
          resolve({ response: completed, streamedChunks, streamedText });
        }
      } catch (error) {
        fail(error);
      }
    };
    socket.on("message", onMessage);
    socket.once("error", onError);
    socket.once("close", onClose);
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      socket.send(JSON.stringify({ ...body, type: "response.create" }), (error) => {
        if (error) fail(webSocketError(error));
      });
    } catch (error) {
      fail(webSocketError(error));
    }
  });
}

function webSocketError(cause) {
  const error = new Error("OpenAI Responses WebSocket is unavailable.", { cause });
  error.webSocketFallback = true;
  return error;
}

function serializeWorkerInput(input) {
  const items = Array.isArray(input)
    ? input
    : input == null
      ? []
      : [{ role: "user", content: input }];
  return items.map((item) => {
    if (item?.type === "tool_call")
      return {
        type: "function_call",
        call_id: item.callId,
        name: item.name,
        arguments: JSON.stringify(item.arguments ?? {}),
      };
    if (item?.type === "tool_result")
      return {
        type: "function_call_output",
        call_id: item.callId,
        output: item.output,
      };
    return item;
  });
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

function isTextualToolCall(text) {
  return [
    /\bto=functions?\.[a-zA-Z0-9_-]+/i,
    /\brecipient(?:_name)?\s*[:=]\s*functions?\.[a-zA-Z0-9_-]+/i,
  ].some((pattern) => pattern.test(text));
}

function responseOutputText(response) {
  return response.output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

function codexHeaders(credentials, additional = {}) {
  return {
    originator: "xarab",
    "user-agent": "xarab/1.0.0",
    authorization: `Bearer ${credentials.access_token}`,
    "chatgpt-account-id": credentials.account_id,
    ...additional,
  };
}

async function responseError(response, action) {
  let code = "unknown_error";
  try {
    const body = await response.json();
    if (typeof body.error?.code === "string") code = body.error.code;
    else if (typeof body.error?.type === "string") code = body.error.type;
  } catch {
    // Avoid echoing response bodies that might contain sensitive provider data.
  }
  const requestId =
    response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
  return new Error(
    `Could not ${action} (${response.status}, ${code}${requestId ? `, request ${requestId}` : ""}).`,
  );
}

function abortError() {
  const error = new Error("OpenAI request was cancelled.");
  error.name = "AbortError";
  return error;
}
