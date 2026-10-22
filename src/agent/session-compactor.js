import { getTheme } from "../ui/theme-engine.js";

export function createSessionCompactor({
  getMessages,
  setMessages,
  setCurrentAgentMessage,
  addMessage,
  classifyForRouting,
  adapter,
  configStore,
  sessionChanged,
  notify,
  updateStatus,
  isGenerating,
  isRouting,
  isSessionOperation,
  setGenerating,
  getAbortController,
  setAbortController,
}) {
  async function compact() {
    if (isGenerating() || isRouting() || isSessionOperation()) {
      addMessage({
        type: "system",
        message: "Wait for the current response to finish before compacting the conversation.",
        severity: "warning",
      });
      return;
    }

    const transcript = getMessages()
      .filter((message) => ["user", "agent"].includes(message.type) && message.message?.trim())
      .map((message) => `${message.type === "user" ? "User" : "Assistant"}:\n${message.message}`)
      .join("\n\n");
    if (!transcript.trim()) {
      addMessage({ type: "system", message: "There is no conversation to compact." });
      return;
    }

    let route;
    try {
      route = await classifyForRouting(
        "Compact the current conversation into a concise summary for a future assistant.",
      );
    } catch (error) {
      addMessage({
        type: "system",
        message: `Compaction classification failed: ${error.message}`,
        severity: "error",
      });
      return;
    }
    if (route?.cancelled) return;
    if (!route) {
      addMessage({
        type: "system",
        message:
          "Configure a local classifier and OpenAI tier worker with /route before compacting.",
        severity: "warning",
      });
      return;
    }

    const { classification, worker } = route;
    if (!worker || worker.provider !== "openai") {
      addMessage({
        type: "system",
        message: `Tier ${classification.tier} needs an OpenAI worker before compacting.`,
        severity: "warning",
      });
      return;
    }
    const modelId = worker.model || configStore.getOpenAIModel();
    if (!modelId) {
      addMessage({
        type: "system",
        message: `Tier ${classification.tier} has no OpenAI model selected.`,
        severity: "warning",
      });
      return;
    }

    const controller = new AbortController();
    const chunks = [];
    let sawDelta = false;
    setGenerating(true);
    setAbortController(controller);
    updateStatus(`OpenAI ${modelId} compacting…`);
    try {
      await adapter.run({
        model: modelId,
        instructions:
          "Create a concise Markdown summary of the conversation for a future assistant. Preserve the user's goals, decisions, constraints, important facts, files, commands, errors, and unresolved work. Do not address the user or add commentary; return only the summary.",
        input: [{ role: "user", content: `Conversation to compact:\n\n${transcript}` }],
        tools: [],
        signal: controller.signal,
        onText(chunk) {
          if (!sawDelta) chunks.push(chunk);
        },
        onTextDelta(chunk) {
          sawDelta = true;
          chunks.push(chunk);
        },
      });
      const summary = chunks.join("").trim();
      if (!summary) throw new Error("The compaction model returned an empty summary.");
      setMessages([
        {
          type: "system",
          message: "Conversation compacted. Earlier messages were replaced with this summary.",
          severity: "info",
        },
        { type: "agent", message: summary, parts: [], color: getTheme().messages.agent },
      ]);
      setCurrentAgentMessage(undefined);
      sessionChanged();
      notify();
    } catch (error) {
      if (!controller.signal.aborted)
        addMessage({
          type: "system",
          message: `Compaction failed: ${error.message}`,
          severity: "error",
        });
    } finally {
      if (getAbortController() === controller) setAbortController(undefined);
      setGenerating(false);
      updateStatus("Ready");
    }
  }

  return { compact };
}
