import React, { useCallback, useRef, useState } from "react";
import { useKeyboard, useSelectionHandler } from "@opentui/react";
import { copyToClipboard } from "./agent/clipboard.js";
import { Composer } from "./components/Composer.component.jsx";
import { StatusBar } from "./components/StatusBar.component.jsx";
import { AssistantMessage } from "./components/AssistantMessage.component.jsx";
import { GeneratingMessage } from "./components/GeneratingMessage.component.jsx";
import { IntentMessage } from "./components/IntentMessage.component.jsx";
import { ShellMessage } from "./components/ShellMessage.component.jsx";
import { UserMessage } from "./components/UserMessage.component.jsx";
import { UnknownMessage } from "./components/UnknownMessage.component.jsx";
import { SystemMessage } from "./components/SystemMessage.component.jsx";
import { ToolMessage } from "./components/ToolMessage.component.jsx";
import { ModelChooser } from "./components/ModelChooser.component.jsx";
import { ModelDownloader } from "./components/ModelDownloader.component.jsx";
import { SessionBrowser } from "./components/SessionBrowser.component.jsx";
import { Welcome } from "./components/Welcome.component.jsx";
import { ToastNotifications } from "./components/ToastNotifications.component.jsx";

const pageScrollKeys = new Map([
  ["pageup", -1],
  ["pagedown", 1],
]);

function Message({ message }) {
  switch (message.type) {
    case "user":
      return <UserMessage message={message.message} classification={message.classification} />;
    case "system":
      return <SystemMessage text={message.message} severity={message.severity} />;
    case "intent":
      return <IntentMessage message={message.message} />;
    case "shell":
      return <ShellMessage message={message} />;
    case "generating":
      return <GeneratingMessage />;
    default:
      return <UnknownMessage type={message.type} message={message.message} />;
  }
}

export function agentTimelineEntries(message, generating = false) {
  const entries = [];
  let text = "";
  let textIndex = 0;
  const flushText = (streaming = false) => {
    if (!text) return;
    entries.push({
      type: "text",
      key: `text-${textIndex++}`,
      responseText: text,
      generating: streaming,
    });
    text = "";
  };

  for (const [partIndex, part] of (message.parts ?? []).entries()) {
    if (part?.type === "text") {
      text += typeof part.text === "string" ? part.text : String(part.text ?? "");
    } else if (part?.type === "tool") {
      flushText();
      entries.push({ type: "tool", key: `tool-${partIndex}`, part });
    }
  }
  flushText(generating);

  // Support sessions saved before text parts were split out, and show a loading
  // indicator only when there is no timeline content yet.
  if (entries.length === 0 && message.message) {
    entries.push({
      type: "text",
      key: "legacy-text",
      responseText: message.message,
      generating: false,
    });
  } else if (entries.length === 0 && generating) {
    entries.push({ type: "text", key: "generating", responseText: "", generating: true });
  }

  return entries;
}

export function App({
  state,
  syntaxStyle,
  onSubmit,
  onStopGeneration,
  onInterrupt,
  onDraftChange,
  onCloseModelModal,
  onDownloadSelectedModel,
  onCancelModelDownload,
  onSearchHuggingFace,
  onSetRouterClassifier,
  onSetRouterTierWorker,
  onDeleteModel,
  onRefreshRouterWorkerModels,
  onOpenSessions,
  onCloseSessions,
  onRestoreSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}) {
  const [toasts, setToasts] = useState([]);
  const chatRef = useRef(null);
  const selectedText = useRef("");
  const nextToastId = useRef(1);

  const dismissToast = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback((message, severity) => {
    const toast = { id: nextToastId.current++, message, severity };
    setToasts((current) => [...current, toast].slice(-3));
  }, []);

  const copySelection = (text) => {
    if (!text.trim()) return false;
    void copyToClipboard(text).then((copied) => {
      showToast(
        copied ? "Copied selection" : "Selection created (clipboard unavailable)",
        copied ? "success" : "warning",
      );
    });
    return true;
  };
  const showWelcome = state.messages.length === 0 && !state.generating;

  useSelectionHandler((selection) => {
    selectedText.current = selection.getSelectedText();
    copySelection(selectedText.current);
  });

  useKeyboard((key) => {
    if (state.modelModal || state.sessionModal || state.sessionOperation) return;
    const pageDirection = pageScrollKeys.get(key.name);
    const stepDirection =
      key.ctrl && (key.name === "up" || key.name === "down")
        ? key.name === "up"
          ? -1
          : 1
        : undefined;

    if (key.name === "home" || key.name === "end") {
      key.preventDefault();
      const chat = chatRef.current;
      if (chat) chat.scrollTo(key.name === "home" ? 0 : chat.scrollHeight);
      return;
    }

    if (pageDirection !== undefined || stepDirection !== undefined) {
      key.preventDefault();
      chatRef.current?.scrollBy(
        pageDirection ?? stepDirection,
        pageDirection !== undefined ? "viewport" : "step",
      );
      return;
    }

    if (key.ctrl && key.name === "c" && !copySelection(selectedText.current)) onInterrupt();
  });

  return (
    <box position="relative" width="100%" height="100%" overflow="hidden">
      <box flexDirection="column" width="100%" height="100%" minHeight={0} overflow="hidden">
        <scrollbox
          ref={chatRef}
          flexGrow={1}
          flexShrink={1}
          minHeight={0}
          scrollY
          stickyScroll
          stickyStart="bottom"
          verticalScrollbarOptions={{ showArrows: true }}
          contentOptions={{ flexDirection: "column" }}
        >
          {showWelcome ? (
            <Welcome />
          ) : (
            state.messages.flatMap((message, index) => {
              const generating = state.generating && index === state.messages.length - 1;
              let entries;

              if (message.type !== "agent") {
                entries = [
                  {
                    key: `${message.type}-${index}`,
                    element: <Message message={message} />,
                  },
                ];
              } else {
                entries = agentTimelineEntries(message, generating).map((entry) => ({
                  key: `${message.type}-${index}-${entry.key}`,
                  element:
                    entry.type === "tool" ? (
                      <ToolMessage part={entry.part} syntaxStyle={syntaxStyle} />
                    ) : (
                      <AssistantMessage
                        message={message}
                        responseText={entry.responseText}
                        generating={entry.generating}
                        syntaxStyle={syntaxStyle}
                      />
                    ),
                }));
              }

              return entries.map(({ key, element }) => (
                <box
                  key={key}
                  flexDirection="column"
                  width="100%"
                  minWidth={0}
                  flexGrow={0}
                  flexShrink={0}
                >
                  {element}
                </box>
              ));
            })
          )}
        </scrollbox>
        <Composer
          flexShrink={0}
          sessionId={state.currentSession?.id}
          draft={state.sessionDraft}
          disabled={
            state.generating ||
            state.commandRunning ||
            state.sessionOperation ||
            Boolean(state.modelModal || state.sessionModal)
          }
          onSubmit={onSubmit}
          onDraftChange={onDraftChange}
          onStopGeneration={onStopGeneration}
          onSessions={onOpenSessions}
        />
        <StatusBar
          status={state.status}
          sessionTitle={state.currentSession?.title}
          sessionError={state.sessionError}
        />
      </box>
      <ToastNotifications toasts={toasts} onDismiss={dismissToast} />
      {state.sessionModal && (
        <SessionBrowser
          {...state.sessionModal}
          currentId={state.currentSession?.id}
          busy={state.sessionOperation}
          onClose={onCloseSessions}
          onSelect={onRestoreSession}
          onNew={onNewSession}
          onDelete={(id) => void onDeleteSession(id)}
          onRename={(id, title) => void onRenameSession(id, title)}
        />
      )}
      {state.modelModal?.mode === "chooser" && (
        <ModelChooser
          {...state.modelModal}
          onClose={onCloseModelModal}
          onSetClassifier={onSetRouterClassifier}
          onSetTierWorker={onSetRouterTierWorker}
          onDeleteModel={onDeleteModel}
          onRefreshWorkerModels={onRefreshRouterWorkerModels}
        />
      )}
      {state.modelModal?.mode === "download" && (
        <ModelDownloader
          {...state.modelModal}
          onClose={onCloseModelModal}
          onDownloadSelected={onDownloadSelectedModel}
          onCancelDownload={onCancelModelDownload}
          onSearch={onSearchHuggingFace}
        />
      )}
    </box>
  );
}
