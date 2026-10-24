const URL = "https://openrouter.ai/api/v1/chat/completions";

export function createOpenRouterWorkerAdapter({ getApiKey, fetchImpl = fetch }) {
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
    const key = getApiKey();
    if (!key) throw new Error("Connect OpenRouter in /connect first.");
    // Hint only stable prefixes; OpenRouter translates supported breakpoints for
    // the selected upstream. Keep changing conversation and tool results unmarked.
    const messages = [
      ...(instructions
        ? [
            {
              role: "system",
              content: [{ type: "text", text: instructions, cache_control: { type: "ephemeral" } }],
            },
          ]
        : []),
      ...(Array.isArray(input) ? input : [{ role: "user", content: String(input) }]).map((item) => {
        if (item.type === "tool_call")
          return {
            role: "assistant",
            content: null,
            tool_calls: [
              {
                id: item.callId,
                type: "function",
                function: { name: item.name, arguments: JSON.stringify(item.arguments ?? {}) },
              },
            ],
          };
        if (item.type === "tool_result")
          return { role: "tool", tool_call_id: item.callId, content: String(item.output ?? "") };
        return item;
      }),
    ];
    const definitions = Object.entries(tools).map(([name, tool]) => ({
      type: "function",
      function: {
        name,
        description: tool.description,
        parameters: tool.params ?? { type: "object", properties: {} },
      },
    }));
    // A breakpoint at the end of the stable tool list covers the entire list
    // without consuming one marker per tool (providers may limit breakpoints).
    if (definitions.length) definitions.at(-1).cache_control = { type: "ephemeral" };
    let usedTool = false;
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new Error("Request cancelled.");
      const response = await fetchImpl(URL, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          ...(definitions.length ? { tools: definitions } : {}),
        }),
        signal,
      });
      if (!response.ok) {
        let detail = "";
        try {
          const body = await response.text();
          const message = JSON.parse(body)?.error?.message;
          if (typeof message === "string")
            detail = message.replace(/[\r\n\x00-\x1f\x7f]/g, " ").slice(0, 300);
        } catch {
          // A non-JSON error body is not safe to display in the conversation.
        }
        const retryAfter = response.headers.get("retry-after");
        const retry = /^\d{1,6}$/.test(retryAfter ?? "")
          ? ` Retry after ${retryAfter} seconds.`
          : "";
        throw new Error(
          `OpenRouter request failed (${response.status}).${detail ? ` ${detail}` : ""}${retry}`,
        );
      }
      if (!response.body?.getReader) throw new Error("OpenRouter did not return a stream.");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let text = "";
      const calls = new Map();
      let finished = false;
      const consume = (block) => {
        const data = block
          .split(/\r?\n/)
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) return;
        if (data === "[DONE]") {
          finished = true;
          return;
        }
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          throw new Error("OpenRouter returned malformed stream data.");
        }
        if (event.error)
          throw new Error(`OpenRouter stream failed (${event.error.code ?? "unknown_error"}).`);
        const delta = event.choices?.[0]?.delta;
        if (typeof delta?.content === "string") {
          text += delta.content;
          if (onTextDelta) onTextDelta(delta.content);
          else onText(delta.content);
        }
        for (const call of delta?.tool_calls ?? []) {
          const current = calls.get(call.index) ?? {
            id: "",
            function: { name: "", arguments: "" },
          };
          if (call.id) current.id = call.id;
          if (call.function?.name) current.function.name += call.function.name;
          if (call.function?.arguments) current.function.arguments += call.function.arguments;
          calls.set(call.index, current);
        }
      };
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split(/\r?\n\r?\n/);
          buffer = blocks.pop();
          for (const block of blocks) consume(block);
        }
        buffer += decoder.decode();
        if (buffer.trim()) consume(buffer);
      } finally {
        reader.releaseLock();
      }
      if (!finished) throw new Error("OpenRouter stream ended unexpectedly.");
      if (!calls.size) {
        if (
          /\bto=functions?\.[a-zA-Z0-9_-]+/i.test(text) ||
          /\brecipient(?:_name)?\s*[:=]\s*functions?\.[a-zA-Z0-9_-]+/i.test(text)
        )
          throw new Error(
            "OpenRouter returned a textual tool call instead of a structured function call.",
          );
        if (usedTool && !text) throw new Error("OpenRouter returned no response after tool calls.");
        return { output: [{ type: "message", content: [{ type: "output_text", text }] }] };
      }
      usedTool = true;
      const toolCalls = [...calls.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, call]) => ({ ...call, type: "function" }));
      messages.push({ role: "assistant", content: text || null, tool_calls: toolCalls });
      for (const call of toolCalls) {
        const tool = tools[call.function.name];
        let output;
        if (!tool?.handler) output = `Error: tool ${call.function.name} is unavailable.`;
        else {
          try {
            const args = JSON.parse(call.function.arguments || "{}");
            onEvent({
              type: "tool_call",
              name: call.function.name,
              callId: call.id,
              arguments: args,
            });
            const result = await tool.handler(args, { callId: call.id, signal });
            const normalized =
              result && typeof result === "object" && typeof result.ok === "boolean"
                ? { ...result, output: String(result.output ?? "") }
                : {
                    ok: true,
                    output: typeof result === "string" ? result : JSON.stringify(result),
                  };
            onEvent({
              type: "tool_result",
              name: call.function.name,
              callId: call.id,
              ok: normalized.ok,
              errorCode: normalized.errorCode,
            });
            if (normalized.handoff) return { handoff: normalized.handoff };
            output = normalized.output;
          } catch (error) {
            output = `Error: ${error?.message ?? String(error)}`;
          }
        }
        messages.push({ role: "tool", tool_call_id: call.id, content: String(output ?? "") });
      }
    }
  }
  return { run };
}
