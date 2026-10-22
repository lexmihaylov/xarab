const CODEX_BASE_URL = "https://chatgpt.com/backend-api/codex";
const RESPONSES_URL = `${CODEX_BASE_URL}/responses`;

export function createOpenAIResponsesClassifierAdapter({
  getCredentials,
  model,
  fetchImpl = fetch,
}) {
  if (typeof getCredentials !== "function")
    throw new TypeError("An OpenAI credentials function is required.");
  if (!model) throw new Error("An OpenAI classifier model is required.");

  async function run({ instructions, input, signal }) {
    if (signal?.aborted) throw abortError();
    const credentials = await getCredentials();
    const response = await fetchImpl(RESPONSES_URL, {
      method: "POST",
      headers: {
        originator: "xarab",
        "user-agent": "xarab/1.0.0",
        authorization: `Bearer ${credentials.access_token}`,
        "chatgpt-account-id": credentials.account_id,
        "content-type": "application/json",
        accept: "text/event-stream",
        "openai-beta": "responses=experimental",
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        store: false,
        stream: true,
      }),
      signal,
    });
    if (!response.ok) throw await responseError(response);
    return readTextStream(response, signal);
  }

  return { run };
}

async function readTextStream(response, signal) {
  if (!response.body?.getReader) throw new Error("OpenAI response did not provide a stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let output = "";
  let completed = false;

  const handleBlock = (block) => {
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
    if (event.type === "response.output_text.delta") output += event.delta ?? "";
    else if (event.type === "response.completed" || event.type === "response.done") {
      completed = true;
      if (!output) output = responseOutputText(event.response);
    } else if (event.type === "response.failed") {
      const error = event.response?.error;
      throw new Error(
        `OpenAI classifier response failed (${error?.code ?? "unknown_error"})${
          error?.message ? `: ${error.message}` : "."
        }`,
      );
    } else if (event.type === "error") {
      const error = event.error ?? event;
      throw new Error(
        `OpenAI classifier stream failed (${error?.code ?? "unknown_error"})${
          error?.message ? `: ${error.message}` : "."
        }`,
      );
    }
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
        handleBlock(block);
      }
      if (done) break;
    }
    if (buffer.trim()) handleBlock(buffer);
  } finally {
    reader.releaseLock?.();
  }
  if (!completed) throw new Error("OpenAI classifier stream ended without response.completed.");
  return output;
}

function responseOutputText(response) {
  return (response?.output ?? [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

async function responseError(response) {
  let code = "unknown_error";
  let message = "";
  let bodyText = "";
  try {
    bodyText = (await response.text()).trim();
    if (bodyText) {
      const body = JSON.parse(bodyText);
      code = body.error?.code ?? body.error?.type ?? code;
      message = typeof body.error?.message === "string" ? body.error.message.trim() : "";
    }
  } catch {
    // The response body may be empty, non-JSON, or unavailable.
  }
  if (!message && bodyText) message = bodyText;
  const contentType = response.headers.get("content-type");
  const details = message ? `: ${message.slice(0, 500)}` : ".";
  const content = contentType ? ` [content-type: ${contentType}]` : "";
  return new Error(
    `Could not OpenAI classifier request (${response.status}, ${code})${content}${details}`,
  );
}

function abortError() {
  const error = new Error("OpenAI classifier request was cancelled.");
  error.name = "AbortError";
  return error;
}
