import React, { useRef, useState } from "react";
import { useKeyboard, useSelectionHandler } from "@opentui/react";
import { copyToClipboard } from "../../agent/clipboard.js";
import { OpenTuiComposer } from "./composer.component.jsx";
import { OpenTuiStatusBar } from "./status-bar.component.jsx";
import { OpenTuiAssistantMessage } from "./assistant-message.component.jsx";
import { OpenTuiGeneratingMessage } from "./generating-message.component.jsx";
import { OpenTuiIntentMessage } from "./intent-message.component.jsx";
import { OpenTuiShellMessage } from "./shell-message.component.jsx";
import { OpenTuiUserMessage } from "./user-message.component.jsx";
import { OpenTuiUnknownMessage } from "./unknown-message.component.jsx";
import { OpenTuiSystemMessage } from "./system-message.component.jsx";
import { OpenTuiToolMessage } from "./tool-message.component.jsx";
import { OpenTuiToolApprovalDialog } from "./tool-approval-dialog.component.jsx";
import { OpenTuiModelChooser } from "./model-chooser.component.jsx";
import { OpenTuiModelDownloader } from "./model-downloader.component.jsx";
import { OpenTuiSessionBrowser } from "./session-browser.component.jsx";

const pageScrollKeys = new Map([
  ["pageup", -1],
  ["pagedown", 1],
]);

function Message({ message, generating, syntaxStyle }) {
  switch (message.type) {
    case "agent":
      return (
        <OpenTuiAssistantMessage
          message={message}
          generating={generating}
          syntaxStyle={syntaxStyle}
        />
      );
    case "user":
      return (
        <OpenTuiUserMessage message={message.message} classification={message.classification} />
      );
    case "system":
      return <OpenTuiSystemMessage text={message.message} severity={message.severity} />;
    case "intent":
      return <OpenTuiIntentMessage message={message.message} />;
    case "shell":
      return <OpenTuiShellMessage message={message.message} severity={message.severity} />;
    case "generating":
      return <OpenTuiGeneratingMessage />;
    default:
      return <OpenTuiUnknownMessage type={message.type} message={message.message} />;
  }
}

export function OpenTuiApp({
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
  onRefreshRouterWorkerModels,
  onApproveToolAction,
  onDenyToolAction,
  onOpenSessions,
  onCloseSessions,
  onRestoreSession,
  onNewSession,
  onDeleteSession,
  onRenameSession,
}) {
  const [notice, setNotice] = useState("");
  const chatRef = useRef(null);
  const selectedText = useRef("");

  const copySelection = (text) => {
    if (!text.trim()) return false;
    void copyToClipboard(text).then((copied) => {
      setNotice(copied ? "Copied selection" : "Selection created (clipboard unavailable)");
    });
    return true;
  };

  useSelectionHandler((selection) => {
    selectedText.current = selection.getSelectedText();
    copySelection(selectedText.current);
  });

  useKeyboard((key) => {
    if (state.modelModal || state.toolApproval || state.sessionModal || state.sessionOperation)
      return;
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
      <box
        flexDirection="column"
        width="100%"
        height="100%"
        minHeight={0}
        overflow="hidden"
        paddingX={1}
      >
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
          {state.messages.flatMap((message, index) => {
            const generating = state.generating && index === state.messages.length - 1;
            let entries;

            if (message.type !== "agent") {
              entries = [
                {
                  key: `${message.type}-${index}`,
                  element: (
                    <Message message={message} generating={generating} syntaxStyle={syntaxStyle} />
                  ),
                },
              ];
            } else {
              // Agent messages are a timeline of text and tool parts. Do not render
              // the empty agent placeholder before the tools: a later streamed text
              // part must remain after the tool that caused it.
              const parts = message.parts ?? [];
              entries = [];
              let text = "";
              let textIndex = 0;
              const flushText = () => {
                if (!text) return;
                const value = text;
                entries.push({
                  key: `${message.type}-${index}-text-${textIndex++}`,
                  element: (
                    <OpenTuiAssistantMessage
                      message={message}
                      responseText={value}
                      syntaxStyle={syntaxStyle}
                    />
                  ),
                });
                text = "";
              };

              for (const [partIndex, part] of parts.entries()) {
                if (part?.type === "text") {
                  text += typeof part.text === "string" ? part.text : String(part.text ?? "");
                } else if (part?.type === "tool") {
                  flushText();
                  entries.push({
                    key: `${message.type}-${index}-tool-${partIndex}`,
                    element: <OpenTuiToolMessage part={part} syntaxStyle={syntaxStyle} />,
                  });
                }
              }
              flushText();

              // Support sessions saved before text parts were split out, and show
              // a loading indicator only when there is no timeline content yet.
              if (entries.length === 0 && message.message) {
                entries.push({
                  key: `${message.type}-${index}-legacy-text`,
                  element: (
                    <OpenTuiAssistantMessage
                      message={message}
                      responseText={message.message}
                      syntaxStyle={syntaxStyle}
                    />
                  ),
                });
              } else if (entries.length === 0 && generating) {
                entries.push({
                  key: `${message.type}-${index}-generating`,
                  element: (
                    <OpenTuiAssistantMessage
                      message={message}
                      generating
                      syntaxStyle={syntaxStyle}
                    />
                  ),
                });
              }
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
          })}
        </scrollbox>
        <OpenTuiComposer
          flexShrink={0}
          sessionId={state.currentSession?.id}
          draft={state.sessionDraft}
          disabled={
            state.generating ||
            state.sessionOperation ||
            Boolean(state.modelModal || state.toolApproval || state.sessionModal)
          }
          onSubmit={onSubmit}
          onDraftChange={onDraftChange}
          onStopGeneration={onStopGeneration}
          onSessions={onOpenSessions}
        />
        <OpenTuiStatusBar
          status={state.status}
          sessionTitle={state.currentSession?.title}
          sessionError={state.sessionError}
          notice={notice}
        />
      </box>
      {state.toolApproval && (
        <OpenTuiToolApprovalDialog
          {...state.toolApproval}
          onApprove={onApproveToolAction}
          onDeny={onDenyToolAction}
        />
      )}
      {state.sessionModal && (
        <OpenTuiSessionBrowser
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
        <OpenTuiModelChooser
          {...state.modelModal}
          onClose={onCloseModelModal}
          onSetClassifier={onSetRouterClassifier}
          onSetTierWorker={onSetRouterTierWorker}
          onRefreshWorkerModels={onRefreshRouterWorkerModels}
        />
      )}
      {state.modelModal?.mode === "download" && (
        <OpenTuiModelDownloader
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
