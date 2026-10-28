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
  openSessionPicker,
  startNewSession,
  saveCurrentSession,
  getActiveSession,
  compactSession,
  openRouteModelModal,
  openDownloadModal,
  openProviderModal,
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

  async function handle(text) {
    if (text.startsWith("!")) return runUserCommand(text.slice(1));
    if (text === "/compact") return compactSession();
    if (text === "/exit") return undefined;
    if (text === "/help") {
      addMessage({
        type: "system",
        message:
          "Commands: /help, /new [name], /sessions, /save [name], /route, /connect, /download [query], /compact, /clear, /exit.\nUse /route to configure the router and tier workers. Routers and workers can use OpenAI or local GGUF models.\nUse /connect to connect providers, then select their models with /route.\nUse /compact to replace the conversation with an AI-generated summary.\nSessions autosave; Ctrl+O opens the session browser. Use /download to search Hugging Face.\nPrefix a shell command with ! to run it and attach its output to your next message.\nEnter sends; Shift+Enter/Ctrl+N adds a line; PgUp/PgDn scroll; Esc stops generation.",
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
    if (text === "/connect") return openProviderModal();
    if (text === "/download" || text.startsWith("/download "))
      return openDownloadModal(text.slice("/download".length).trim());

    const userMessage = addMessage({
      type: "user",
      message: text,
      classification: { status: "classifying" },
    });
    let route;
    try {
      route = await classifyForRouting(text);
    } catch (error) {
      userMessage.classification = { status: "error" };
      notify();
      throw error;
    }
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
