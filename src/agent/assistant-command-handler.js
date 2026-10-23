import { runShellCommand } from "./worker/tools/shell-command-executor.js";
import {
  appendShellContext,
  createShellContextEntry,
  formatShellResult,
} from "../utils/shell-context.js";

export function createCommandHandler({
  workspace,
  addMessage,
  updateStatus,
  notify,
  getPendingShellContext,
  setPendingShellContext,
  sessionChanged,
  isGenerating,
  isRouting,
  getCommandRunning,
  setCommandRunning,
  openAIAuth,
  clipboardWriter,
  getPendingOpenAIAuthUrl,
  setPendingOpenAIAuthUrl,
  openAIAdapter,
  getAbortController,
  configStore,
  modelManager,
  openSessionPicker,
  startNewSession,
  saveCurrentSession,
  getActiveSession,
  compactSession,
  openRouteModelModal,
  openDownloadModal,
  classifyForRouting,
  runWorker,
}) {
  async function runUserCommand(command) {
    if (!command.trim())
      return addMessage({
        type: "system",
        message: "Use ! followed by a shell command, for example: !git status",
        severity: "warning",
      });
    if (isGenerating() || isRouting() || getCommandRunning())
      return addMessage({
        type: "system",
        message: "Wait for the current work to finish before running a shell command.",
        severity: "warning",
      });

    setCommandRunning(true);
    updateStatus("Running command…");
    const shellMessage = addMessage({ type: "shell", command, message: "", running: true });
    await new Promise((resolve) => setImmediate(resolve));
    try {
      const result = await runShellCommand(command, { cwd: workspace });
      shellMessage.message = formatShellResult(command, result, workspace);
      shellMessage.severity =
        result.timedOut || result.error ? "error" : result.code === 0 ? "info" : "warning";
      delete shellMessage.running;
      setPendingShellContext(
        appendShellContext(getPendingShellContext(), createShellContextEntry(command, result)),
      );
      sessionChanged();
      notify();
    } finally {
      setCommandRunning(false);
      updateStatus("Ready");
    }
  }

  async function handleOpenAICommand(text) {
    const [command, ...args] = text.slice("/openai".length).trim().split(/\s+/);
    if (command === "login") {
      const { authorizationUrl, redirectUri } = await openAIAuth.startAuthorization();
      setPendingOpenAIAuthUrl(authorizationUrl);
      let copied = false;
      try {
        copied = await clipboardWriter(authorizationUrl);
      } catch {
        // Keep login usable even when clipboard integration is unavailable.
      }
      addMessage({
        type: "system",
        message: [
          "OpenAI Codex sign-in started (valid for 10 minutes).",
          copied
            ? "1. The sign-in URL is copied to your clipboard. Paste it into your browser and sign in to ChatGPT."
            : "1. Could not access your clipboard. Run /openai copy to retry, then paste the URL into your browser.",
          `2. Copy the full browser URL after it redirects to ${redirectUri}.`,
          "3. Paste that redirected URL here. Xarab does not run a callback server.",
        ].join("\n"),
      });
      return;
    }
    if (command === "copy") {
      const url = getPendingOpenAIAuthUrl();
      if (!url) throw new Error("No active sign-in URL. Run /openai login first.");
      if (!(await clipboardWriter(url)))
        throw new Error(
          "Could not access a clipboard utility. On WSL2, ensure clip.exe is available.",
        );
      addMessage({
        type: "system",
        message: "OpenAI sign-in URL copied. Paste it into your browser.",
      });
      return;
    }
    if (command === "status") {
      const account = await openAIAuth.getStatus();
      addMessage({
        type: "system",
        message: account.connected
          ? `Codex OAuth connected (account ${account.accountId.slice(0, 8)}…). Use /openai models to list models.`
          : "ChatGPT OAuth is not connected. Run /openai login.",
      });
      return;
    }
    if (command === "logout") {
      setPendingOpenAIAuthUrl(undefined);
      const result = await openAIAuth.signOut();
      addMessage({
        type: "system",
        message: result.signedOut
          ? result.revoked
            ? "Signed out of Codex locally. The OAuth tokens were removed from this device."
            : "No Codex account was connected."
          : "No ChatGPT account was connected.",
      });
      return;
    }
    if (command === "models") {
      const models = await openAIAdapter.listModels({ signal: getAbortController()?.signal });
      addMessage({
        type: "system",
        message: models.length
          ? `ChatGPT plan models (select with /openai use <id>):\n${models.map((model) => `- ${model.name} (${model.id})`).join("\n")}`
          : "No models available for this ChatGPT account.",
      });
      return;
    }
    if (command === "use") {
      const modelId = args.join(" ").trim();
      if (!modelId) throw new Error("Usage: /openai use <model-id>");
      await configStore.setOpenAIModel(modelId);
      addMessage({ type: "system", message: `OpenAI worker model set to ${modelId}.` });
      return;
    }
    if (command === "ask") {
      const prompt = text.slice("/openai ask".length).trim();
      if (!prompt) throw new Error("Usage: /openai ask <request>");
      return runWorker(prompt);
    }
    addMessage({
      type: "system",
      message:
        "OpenAI commands: /openai login, /openai status, /openai models, /openai use <model-id>, /openai ask <request>, /openai logout. OAuth uses a pasted localhost redirect URL; no callback server is started.",
    });
  }

  async function handle(text) {
    if (text.startsWith("!")) return runUserCommand(text.slice(1));
    if (text === "/openai" || text.startsWith("/openai ")) return handleOpenAICommand(text);
    if (text === "/compact") return compactSession();
    if (text === "/exit") return undefined;
    if (text === "/help") {
      addMessage({
        type: "system",
        message:
          "Commands: /help, /new [name], /sessions, /save [name], /route, /download [query], /openai [login|status|models|use|ask|logout], /compact, /clear, /exit.\nUse /route to configure the router and tier workers. Routers and workers can use OpenAI or local GGUF models.\nUse /openai login, /openai models, and /openai use <id> to configure OpenAI workers. /openai ask <request> runs it directly.\nUse /compact to replace the conversation with an AI-generated summary.\nSessions autosave; Ctrl+O opens the session browser. Use /download to search Hugging Face.\nPrefix a shell command with ! to run it and attach its output to your next message.\nEnter sends; Shift+Enter/Ctrl+N adds a line; PgUp/PgDn scroll; Esc stops generation.",
      });
      return;
    }
    if (text === "/sessions") return openSessionPicker();
    if (text === "/new" || text.startsWith("/new ")) return startNewSession(text.slice(4).trim());
    if (text === "/save" || text.startsWith("/save ")) {
      const saved = await saveCurrentSession({
        name: text.slice(5).trim() || undefined,
        force: true,
      });
      updateStatus(
        saved
          ? `Session saved: ${getActiveSession().title}`
          : "Session will be saved with your first message",
      );
      return;
    }
    if (text === "/clear") {
      if (!(await startNewSession())) return;
      addMessage({
        type: "system",
        message: "Conversation cleared. System and project instructions remain active.",
      });
      return;
    }
    if (text === "/route") return openRouteModelModal();
    if (text === "/download" || text.startsWith("/download "))
      return openDownloadModal(text.slice("/download".length).trim());

    const userMessage = addMessage({
      type: "user",
      message: text,
      classification: { status: "classifying" },
    });
    const route = await classifyForRouting(text);
    if (route?.cancelled) {
      userMessage.classification = { status: "cancelled" };
      notify();
      return;
    }
    if (!route) {
      userMessage.classification = { status: "error" };
      notify();
      return addMessage({
        type: "system",
        message: "Configure a router and tier worker with /route before chatting.",
        severity: "warning",
      });
    }
    const { classification, worker } = route;
    if (!worker) {
      userMessage.classification = { status: "error" };
      notify();
      throw new Error(`No worker is configured for Tier ${classification.tier}.`);
    }
    if (!worker.configured) {
      userMessage.classification = { status: "error" };
      notify();
      throw new Error("Tier worker configuration is invalid; choose a model in /route.");
    }
    userMessage.classification = {
      status: "done",
      tier: classification.tier,
      model: worker.model,
      confidence: classification.confidence,
      rationale: classification.rationale,
    };
    notify();
    return runWorker(text, {
      tier: classification.tier,
      userMessage,
    });
  }

  return { handle };
}
