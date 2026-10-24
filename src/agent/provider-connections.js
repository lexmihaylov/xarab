// UI-neutral provider contract. Additional providers can register the same actions.
export function createProviderConnections({
  openAIAuth,
  clipboardWriter,
  onOpenAIConnected,
  onOpenRouterChanged = () => {},
  configStore,
}) {
  let authorizationUrl;
  const openai = {
    id: "openai",
    name: "OpenAI",
    instructions: "Sign in with ChatGPT, then paste the full localhost redirect URL here.",
    async status() {
      const account = await openAIAuth.getStatus();
      return account.connected
        ? `Connected · account ${account.accountId.slice(0, 8)}…`
        : "Not connected";
    },
    async connect() {
      const result = await openAIAuth.startAuthorization();
      authorizationUrl = result.authorizationUrl;
      return { url: authorizationUrl, copied: await copy() };
    },
    async copy() {
      return copy();
    },
    async complete(input) {
      const account = await openAIAuth.completeAuthorization(input);
      authorizationUrl = undefined;
      await onOpenAIConnected();
      return account;
    },
    async disconnect() {
      authorizationUrl = undefined;
      return openAIAuth.signOut();
    },
  };
  async function copy() {
    if (!authorizationUrl) throw new Error("Start sign-in first.");
    try {
      return Boolean(await clipboardWriter(authorizationUrl));
    } catch {
      return false;
    }
  }
  const openrouter = {
    id: "openrouter",
    name: "OpenRouter",
    method: "apiKey",
    async status() {
      return configStore.getApiKey("openrouter")
        ? "API key saved · verify by refreshing models in /route"
        : "No API key saved";
    },
    async complete(input) {
      await configStore.setApiKey("openrouter", input);
      await onOpenRouterChanged();
    },
    async disconnect() {
      await configStore.removeApiKey("openrouter");
      await onOpenRouterChanged();
    },
  };
  return [openai, openrouter];
}
