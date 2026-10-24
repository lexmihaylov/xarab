// Do not expose models until execution supports OpenRouter assignments.
export function createOpenRouterModelManager({ getApiKey, fetchImpl = fetch } = {}) {
  return {
    async listModels({ signal } = {}) {
      const key = getApiKey?.();
      if (!key) return [];
      const response = await fetchImpl("https://openrouter.ai/api/v1/models", {
        headers: { authorization: `Bearer ${key}` },
        signal,
      });
      if (!response.ok) throw new Error(`Could not list OpenRouter models (${response.status}).`);
      const body = await response.json();
      if (!Array.isArray(body?.data)) throw new Error("OpenRouter returned an invalid model list.");
      return body.data
        .filter(
          (model) =>
            typeof model.id === "string" &&
            model.id &&
            model.architecture?.output_modalities?.includes("text"),
        )
        .map((model) => ({ provider: "openrouter", id: model.id, name: model.name || model.id }));
    },
  };
}
