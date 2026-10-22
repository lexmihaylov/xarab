import path from "node:path";
import { newSession } from "./session-store.js";
import { restoreMessages } from "./session-history.js";

export function createSessionController({
  workspace,
  sessionStore,
  getMessages,
  setMessages,
  getPendingShellContext,
  setPendingShellContext,
  getDraftMessage,
  addMessage,
  notify,
  updateStatus,
  isGenerating,
  isRouting,
  getActiveDownload,
  isShuttingDown,
  getSessionPersisted,
  setSessionPersisted,
}) {
  let activeSession = newSession(workspace);
  let draft = { value: "", cursor: 0 };
  let lastTurnInterrupted = false;
  let sessionModal = null;
  let sessionOperation = false;
  let sessionRequest = 0;
  let sessionError = null;
  let sessionRevision = 0;
  let savedRevision = 0;
  let saveTimer;

  function getState() {
    return {
      currentSession: {
        id: activeSession.id,
        title: activeSession.title,
        updatedAt: activeSession.updatedAt,
      },
      sessionDraft: { ...draft },
      sessionModal,
      sessionOperation,
      sessionError,
    };
  }

  function sessionSnapshot() {
    return {
      ...activeSession,
      messages: getMessages(),
      history: [],
      draft,
      pendingShellContext: getPendingShellContext(),
      interrupted: isGenerating() || isRouting() || lastTurnInterrupted,
      turn: null,
    };
  }

  function hasSessionContent() {
    return (
      getSessionPersisted() ||
      getMessages().some((message) => message.type === "user" || message.type === "shell")
    );
  }

  function sessionChanged() {
    sessionRevision++;
    activeSession.updatedAt = new Date().toISOString();
    if (isShuttingDown() || sessionOperation || saveTimer || !hasSessionContent()) return;
    saveTimer = setTimeout(() => {
      saveTimer = undefined;
      void saveCurrentSession().catch((error) => {
        sessionError = `Session could not be saved: ${error.message}`;
        notify();
      });
    }, 1000);
    saveTimer.unref?.();
  }

  async function saveCurrentSession({ name, force = false } = {}) {
    if (name !== undefined) {
      const title = name
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .trim()
        .slice(0, 80);
      if (!title) throw new Error("Session name cannot be empty");
      activeSession.title = title;
      activeSession.manualTitle = true;
      sessionChanged();
    }
    clearTimeout(saveTimer);
    saveTimer = undefined;
    if (!hasSessionContent()) return;
    if (!force && getSessionPersisted() && savedRevision === sessionRevision) return;
    const revision = sessionRevision;
    const id = activeSession.id;
    const saved = await sessionStore.save(sessionSnapshot());
    if (activeSession.id === id) {
      setSessionPersisted(true);
      savedRevision = Math.max(savedRevision, revision);
      if (sessionRevision === revision) activeSession.updatedAt = saved.updatedAt;
      const hadError = Boolean(sessionError);
      sessionError = null;
      if (hadError) notify();
    }
    return saved;
  }

  function updateDraft(next) {
    if (isShuttingDown() || sessionOperation || !next || typeof next.value !== "string") return;
    const cursor = Math.max(
      0,
      Math.min(next.value.length, Number.isInteger(next.cursor) ? next.cursor : next.value.length),
    );
    if (draft.value === next.value && draft.cursor === cursor) return;
    draft = { value: next.value, cursor };
    sessionChanged();
  }

  function canSwitchSession() {
    if (isShuttingDown()) return false;
    if (isGenerating() || sessionOperation || getActiveDownload()) {
      const error = "Stop active generation or downloads before switching sessions.";
      if (sessionModal) {
        sessionModal = { ...sessionModal, error };
        notify();
      } else addMessage({ type: "system", message: error, severity: "warning" });
      return false;
    }
    return true;
  }

  async function startNewSession(name) {
    if (!canSwitchSession()) return;
    sessionOperation = true;
    notify();
    try {
      await saveCurrentSession();
      activeSession = newSession(workspace, name?.trim().slice(0, 80));
      setSessionPersisted(false);
      sessionRevision = 0;
      savedRevision = 0;
      setMessages([]);
      setPendingShellContext([]);
      draft = { value: "", cursor: 0 };
      lastTurnInterrupted = false;
      sessionModal = null;
      sessionRequest++;
      sessionError = null;
      sessionChanged();
      updateStatus("Ready");
      return true;
    } catch (error) {
      sessionError = `Could not start a new session: ${error.message}`;
      if (sessionModal) sessionModal = { ...sessionModal, error: sessionError };
      return false;
    } finally {
      sessionOperation = false;
      if (sessionRevision !== savedRevision) sessionChanged();
      notify();
    }
  }

  async function openSessionPicker() {
    if (!canSwitchSession()) return;
    const request = ++sessionRequest;
    sessionModal = { sessions: [], loading: true, error: null };
    notify();
    try {
      await saveCurrentSession();
      const listing = await sessionStore.list(workspace);
      if (request !== sessionRequest || !sessionModal) return;
      sessionModal = {
        sessions: listing.sessions,
        loading: false,
        error: listing.errors.length
          ? `${listing.errors.length} unreadable session(s) were skipped: ${listing.errors[0]}`
          : null,
      };
    } catch (error) {
      if (request === sessionRequest && sessionModal)
        sessionModal = { ...sessionModal, loading: false, error: error.message };
    }
    notify();
  }

  function closeSessionPicker() {
    if (sessionOperation) return;
    sessionRequest++;
    sessionModal = null;
    notify();
  }

  async function restoreSession(id) {
    if (!canSwitchSession()) return;
    if (id === activeSession.id) {
      closeSessionPicker();
      return;
    }
    sessionOperation = true;
    if (sessionModal) sessionModal = { ...sessionModal, busy: true, error: null };
    notify();
    try {
      const record = await sessionStore.load(id);
      if (record.workspace !== path.resolve(workspace))
        throw new Error(
          "This session belongs to another workspace. Open Xarab in that workspace to resume it.",
        );
      await saveCurrentSession();
      activeSession = record;
      setSessionPersisted(true);
      sessionRevision = 0;
      savedRevision = 0;
      setMessages(restoreMessages(record.messages));
      setPendingShellContext(record.pendingShellContext);
      draft = record.draft;
      lastTurnInterrupted = record.interrupted;
      sessionModal = null;
      sessionRequest++;
      sessionError = null;
      if (record.interrupted)
        addMessage({
          type: "system",
          message:
            "This session was interrupted. Unfinished tools have not been replayed; verify their effects before retrying.",
          severity: "warning",
        });
      updateStatus("Session restored");
      sessionChanged();
    } catch (error) {
      sessionError = `Could not restore session: ${error.message}`;
      if (sessionModal) sessionModal = { ...sessionModal, error: sessionError, busy: false };
    } finally {
      sessionOperation = false;
      if (sessionRevision !== savedRevision) sessionChanged();
      notify();
    }
  }

  async function renameSession(id, title) {
    if (!canSwitchSession()) return false;
    const normalized = String(title ?? "")
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 80);
    if (!normalized) {
      if (sessionModal) sessionModal = { ...sessionModal, error: "Session name cannot be empty." };
      notify();
      return false;
    }
    sessionOperation = true;
    if (sessionModal) sessionModal = { ...sessionModal, busy: true, error: null };
    notify();
    try {
      const record = await sessionStore.load(id);
      record.title = normalized;
      record.manualTitle = true;
      record.updatedAt = new Date().toISOString();
      await sessionStore.save(record);
      if (id === activeSession.id) {
        activeSession = record;
        sessionChanged();
      }
      const listing = await sessionStore.list(workspace);
      if (sessionModal)
        sessionModal = {
          ...sessionModal,
          sessions: listing.sessions,
          loading: false,
          busy: false,
          error: listing.errors.length
            ? `${listing.errors.length} unreadable session(s) were skipped: ${listing.errors[0]}`
            : null,
        };
      return true;
    } catch (error) {
      if (sessionModal)
        sessionModal = {
          ...sessionModal,
          busy: false,
          error: `Could not rename session: ${error.message}`,
        };
      return false;
    } finally {
      sessionOperation = false;
      notify();
    }
  }

  async function deleteSession(id) {
    if (!canSwitchSession()) return false;
    sessionOperation = true;
    if (sessionModal) sessionModal = { ...sessionModal, busy: true, error: null };
    notify();
    const removingActive = id === activeSession.id;
    let deleted = true;
    try {
      await sessionStore.remove(id);
      if (removingActive) {
        clearTimeout(saveTimer);
        saveTimer = undefined;
        activeSession = newSession(workspace);
        setSessionPersisted(false);
        sessionRevision = 0;
        savedRevision = 0;
        setMessages([]);
        setPendingShellContext([]);
        draft = { value: "", cursor: 0 };
        lastTurnInterrupted = false;
        sessionError = null;
        updateStatus("Session deleted");
      }
      const listing = await sessionStore.list(workspace);
      if (sessionModal)
        sessionModal = {
          ...sessionModal,
          sessions: listing.sessions,
          loading: false,
          busy: false,
          error: listing.errors.length
            ? `${listing.errors.length} unreadable session(s) were skipped: ${listing.errors[0]}`
            : null,
        };
    } catch (error) {
      deleted = false;
      sessionError = `Could not delete session: ${error.message}`;
      if (sessionModal) sessionModal = { ...sessionModal, busy: false, error: sessionError };
    } finally {
      sessionOperation = false;
      if (sessionRevision !== savedRevision) sessionChanged();
      notify();
    }
    return deleted;
  }

  return {
    getState,
    isSessionOperation: () => sessionOperation,
    setSessionError: (error) => {
      sessionError = error;
    },
    getActiveSession: () => activeSession,
    getLastTurnInterrupted: () => lastTurnInterrupted,
    setLastTurnInterrupted: (value) => (lastTurnInterrupted = value),
    sessionSnapshot,
    sessionChanged,
    saveCurrentSession,
    updateDraft,
    startNewSession,
    openSessionPicker,
    closeSessionPicker,
    restoreSession,
    renameSession,
    deleteSession,
  };
}
