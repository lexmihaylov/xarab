const MODELS_URL = new URL("https://chatgpt.com/backend-api/codex/models");
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

export function createOpenAIModelManager({ getCredentials, fetchImpl = fetch }) {
  async function listModels({ signal } = {}) {
    const credentials = await getCredentials();
    const response = await fetchImpl(MODELS_URL, {
      headers: {
        originator: "xarab",
        "user-agent": "xarab/1.0.0",
        authorization: `Bearer ${credentials.access_token}`,
        "chatgpt-account-id": credentials.account_id,
        accept: "application/json",
      },
      signal,
    });
    if (!response.ok) {
      let code = "unknown_error";
      try {
        const body = await response.json();
        if (typeof body.error?.code === "string") code = body.error.code;
        else if (typeof body.error?.type === "string") code = body.error.type;
      } catch {
        // Avoid exposing provider response bodies.
      }
      const requestId =
        response.headers.get("x-request-id") ?? response.headers.get("openai-request-id");
      throw new Error(
        `Could not list OpenAI models (${response.status}, ${code}${requestId ? `, request ${requestId}` : ""}).`,
      );
    }
    const body = await response.json();
    const entries = Array.isArray(body) ? body : (body.models ?? []);
    const models = new Map(
      entries
        .filter((model) => model.slug || model.model_slug || model.id)
        .map((model) => {
          const id = model.slug ?? model.model_slug ?? model.id;
          return [id, { provider: "openai", id, name: model.display_name || model.name || id }];
        }),
    );
    for (const model of KNOWN_CODEX_MODELS) {
      if (!models.has(model.id)) models.set(model.id, { provider: "openai", ...model });
    }
    return [...models.values()];
  }
  return { listModels };
}
