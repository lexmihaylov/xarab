const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const RESPONSES_URL = `${CODEX_BASE_URL}/responses`;
const MODELS_URL = new URL(`${CODEX_BASE_URL}/models`);
MODELS_URL.searchParams.set("client_version", "0.0.0");

export function createOpenAIResponsesAdapter({ getCredentials, fetchImpl = fetch }) {
  async function listModels({ signal } = {}) {
    const credentials = await getCredentials();
    const response = await fetchImpl(MODELS_URL, {
      headers: codexHeaders(credentials, { accept: "application/json" }),
      signal,
    });
    if (!response.ok) throw await responseError(response, "list OpenAI models");
    const body = await response.json();
    const entries = Array.isArray(body) ? body : (body.models ?? []);
    return entries
      .filter((model) => model.slug || model.model_slug || model.id)
      .map((model) => {
        const id = model.slug ?? model.model_slug ?? model.id;
        return { id, name: model.display_name || model.name || id };
      });
  }

  async function run({
    model,
    instructions,
    input,
    tools = {},
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
    let requestInput = Array.isArray(input) ? [...input] : (input ?? []);
    let completedResponse;
    let sawToolCall = false;

    while (true) {
      if (signal?.aborted) throw abortError();
      const response = await fetchImpl(RESPONSES_URL, {
        method: "POST",
        headers: codexHeaders(credentials, {
          "content-type": "application/json",
          accept: "text/event-stream",
          "openai-beta": "responses=experimental",
        }),
        body: JSON.stringify({
          model,
          instructions,
          input: requestInput,
          tools: apiTools,
          parallel_tool_calls: false,
          reasoning: {
            effort: "medium",
            summary: "auto",
          },
          store: false,
          stream: true,
          include: ["reasoning.encrypted_content"],
        }),
        signal,
      });
      if (!response.ok) throw await responseError(response, "OpenAI Responses request");
      const streamedChunks = [];
      let streamedText = "";
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
            throw new Error("OpenAI completed the turn after a tool call without a text response.");
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
        onEvent({ type: "tool_call", name: call.name, arguments: args });
        let result;
        try {
          result = normalizeToolResult(await tool.handler(args));
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
        functionOutputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: result.output,
        });
      }
      requestInput = [
        ...(Array.isArray(requestInput) ? requestInput : [{ role: "user", content: requestInput }]),
        ...completedResponse.output,
        ...functionOutputs,
      ];
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
      throw new Error(`OpenAI stream failed (${event.code ?? "unknown_error"}).`);
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
