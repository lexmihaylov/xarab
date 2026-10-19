import React, { useRef } from "react";
import { Box, useStdin, useWindowSize } from "ink";
import { ChatPanel } from "./components/chat-panel.component.jsx";
import { Composer } from "./components/composer.component.jsx";
import { StatusBar } from "./components/status-bar.component.jsx";
import { ModelChooser } from "./components/model-chooser.component.jsx";
import { ModelDownloader } from "./components/model-downloader.component.jsx";
import { ToolApprovalDialog } from "./components/tool-approval-dialog.component.jsx";
import { useChatScroll } from "./hooks/use-chat-scroll.js";
import { useComposer } from "./hooks/use-composer.js";
import { getComposerRows } from "./composer-layout.js";
import { SessionBrowser } from "./components/session-browser.component.jsx";

export function App({
  state,
  onSubmit,
  onEscape,
  onInterrupt,
  onCloseModelModal,
  onDownloadSelectedModel,
  onCancelModelDownload,
  onSearchHuggingFace,
  onDeleteModel,
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
  onDraftChange,
}) {
  const {
    messages,
    status,
    generating,
    modelModal,
    toolApproval,
    sessionModal,
    sessionOperation,
    currentSession,
    sessionDraft,
    sessionError,
  } = state;
  const { isRawModeSupported } = useStdin();
  const {
    rows: height = process.stdout.rows ?? 24,
    columns: width = process.stdout.columns ?? 80,
  } = useWindowSize();
  const scrollHandler = useRef(() => {});
  const { value, cursor, suggestions, selectedSuggestionIndex } = useComposer({
    onSubmit,
    onEscape,
    onInterrupt,
    onScroll: (offset) => scrollHandler.current(offset),
    isActive:
      isRawModeSupported && !modelModal && !toolApproval && !sessionModal && !sessionOperation,
    isGenerating: generating || sessionOperation,
    sessionId: currentSession?.id,
    initialDraft: sessionDraft,
    onDraftChange,
    onSessions: onOpenSessions,
  });
  const composerRows = getComposerRows({
    value,
    cursor,
    width,
    maxRows: Math.max(1, Math.min(6, height - suggestions.length - 9)),
    disabled: generating,
    isActive:
      isRawModeSupported && !modelModal && !toolApproval && !sessionModal && !sessionOperation,
  });
  const chatHeight = Math.max(1, height - composerRows - 5 - suggestions.length);
  const { scroll, scrollOffset, visibleLines } = useChatScroll(
    messages,
    chatHeight,
    width,
    generating,
    currentSession?.id,
    !modelModal && !toolApproval && !sessionModal && !sessionOperation,
  );
  scrollHandler.current = scroll;

  return (
    <Box flexDirection="column" width={width} height={height}>
      <ChatPanel
        lines={visibleLines}
        width={width}
        height={chatHeight}
        scrollOffset={scrollOffset}
      />
      <Composer
        value={value}
        cursor={cursor}
        rows={composerRows}
        width={width}
        disabled={generating || sessionOperation}
        isActive={
          isRawModeSupported && !modelModal && !toolApproval && !sessionModal && !sessionOperation
        }
        suggestions={suggestions}
        selectedSuggestionIndex={selectedSuggestionIndex}
      />
      <StatusBar
        status={status}
        sessionError={sessionError}
        sessionTitle={currentSession?.title}
        width={width}
      />
      {(modelModal || toolApproval || sessionModal) && (
        <Box
          position="absolute"
          top={0}
          left={0}
          width={width}
          height={height}
          backgroundColor="#202d38"
        >
          {toolApproval ? (
            <ToolApprovalDialog
              {...toolApproval}
              width={width}
              height={height}
              onApprove={onApproveToolAction}
              onDeny={onDenyToolAction}
            />
          ) : sessionModal ? (
            <SessionBrowser
              {...sessionModal}
              busy={sessionOperation}
              currentId={currentSession?.id}
              width={width}
              height={height}
              onClose={onCloseSessions}
              onSelect={onRestoreSession}
              onNew={onNewSession}
              onDelete={(id) => void onDeleteSession(id)}
              onRename={(id, title) => void onRenameSession(id, title)}
            />
          ) : modelModal.mode === "chooser" ? (
            <ModelChooser
              {...modelModal}
              width={width}
              height={height}
              onClose={onCloseModelModal}
              onDelete={onDeleteModel}
              onSetClassifier={onSetRouterClassifier}
              onSetTierWorker={onSetRouterTierWorker}
              onRefreshWorkerModels={onRefreshRouterWorkerModels}
            />
          ) : (
            <ModelDownloader
              {...modelModal}
              width={width}
              height={height}
              onClose={onCloseModelModal}
              onDownloadSelected={onDownloadSelectedModel}
              onCancelDownload={onCancelModelDownload}
              onSearch={onSearchHuggingFace}
            />
          )}
        </Box>
      )}
    </Box>
  );
}
