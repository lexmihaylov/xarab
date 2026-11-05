import React, { useEffect, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { LoadingIndicator } from "./LoadingIndicator.component.jsx";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;

const commandOptions = [
  { command: "/help", description: "Show available commands" },
  { command: "/route", description: "Configure router and tier workers" },
  { command: "/connect", description: "Connect to AI providers" },
  { command: "/mcp logout", description: "Remove stored MCP OAuth credentials" },

  { command: "/download", description: "Search Hugging Face for models" },
  { command: "/sessions", description: "Restore, switch, or delete sessions" },
  { command: "/new", description: "Start a new session" },
  { command: "/save", description: "Save or name this session" },
  { command: "/clear", description: "Clear the conversation" },
  { command: "/compact", description: "Summarize and compact the conversation" },
  { command: "/exit", description: "Exit Xarab" },
];

export function Composer({
  flexShrink = 0,
  sessionId,
  draft,
  messageSuggestion,
  disabled = false,
  generating = false,
  queuedMessages = [],
  onRemoveQueuedMessage,
  onSubmit,
  onDraftChange,
  onStopGeneration,
  onSessions,
  contextTokens,
}) {
  const { height: terminalHeight } = useTerminalDimensions();
  const roomyQueue = terminalHeight >= 10;
  const inputRef = useRef(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [value, setValue] = useState(draft?.value ?? "");
  // OpenTUI can wrap a dynamically updated placeholder using stale layout information.
  // Remount only when the draft is empty, so editing and cursor position are preserved.
  const placeholderKey = useRef(0);
  const previousSuggestion = useRef(messageSuggestion);
  if (!value && previousSuggestion.current !== messageSuggestion) {
    previousSuggestion.current = messageSuggestion;
    placeholderKey.current += 1;
  }
  const sessionRef = useRef(sessionId);
  const suggestions =
    !disabled && value.startsWith("/") && !value.includes("\n")
      ? commandOptions.filter(({ command }) => command.startsWith(value.toLowerCase()))
      : [];
  const selectedSuggestion = suggestions[Math.min(suggestionIndex, suggestions.length - 1)];
  const commandColumnWidth =
    suggestions.reduce((width, suggestion) => Math.max(width, suggestion.command.length), 0) + 3;
  const queuePaused = queuedMessages.length > 0 && !generating && !disabled;
  const queuePreviewLimit = queuePaused ? 1 : 2;
  const queuePreviews = queuedMessages.slice(0, queuePreviewLimit);
  const hiddenQueueCount = queuedMessages.length - queuePreviews.length;

  useEffect(() => {
    if (sessionRef.current === sessionId) return;
    sessionRef.current = sessionId;
    const nextValue = draft?.value ?? "";
    setValue(nextValue);
    setSuggestionIndex(0);
    inputRef.current?.setText(nextValue);
    inputRef.current.cursorOffset = draft?.cursor ?? nextValue.length;
  }, [draft?.cursor, draft?.value, sessionId]);

  function updateDraft() {
    const nextValue = inputRef.current?.plainText ?? "";
    const cursor = inputRef.current?.cursorOffset ?? nextValue.length;
    if (
      nextValue === value &&
      nextValue === (draft?.value ?? "") &&
      cursor === (draft?.cursor ?? 0)
    )
      return;
    setValue(nextValue);
    onDraftChange({ value: nextValue, cursor });
  }

  function completeCommand(suggestion = selectedSuggestion) {
    if (!suggestion) return;
    const nextValue =
      suggestion.acceptsArgument || ["/download", "/new", "/save"].includes(suggestion.command)
        ? `${suggestion.command} `
        : suggestion.command;
    inputRef.current?.setText(nextValue);
    inputRef.current.cursorOffset = nextValue.length;
    setValue(nextValue);
    onDraftChange({ value: nextValue, cursor: nextValue.length });
  }

  function submit() {
    const submitted = inputRef.current?.plainText ?? "";
    if (!submitted.trim() || disabled) return;
    inputRef.current?.clear();
    setValue("");
    onDraftChange({ value: "", cursor: 0 });
    onSubmit(submitted);
  }

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      onStopGeneration?.();
      return;
    }
    if (key.ctrl && key.name === "o") {
      key.preventDefault();
      if (!disabled) onSessions?.();
      return;
    }
    if (disabled) return;
    if (key.ctrl && key.name === "x" && queuedMessages.length) {
      key.preventDefault();
      onRemoveQueuedMessage?.(queuedMessages[queuedMessages.length - 1].id);
      return;
    }
    if (key.name === "tab" && suggestions.length) {
      key.preventDefault();
      completeCommand();
      return;
    }
    if (key.name === "tab" && !value && messageSuggestion) {
      key.preventDefault();
      inputRef.current?.setText(messageSuggestion);
      inputRef.current.cursorOffset = messageSuggestion.length;
      setValue(messageSuggestion);
      onDraftChange({ value: messageSuggestion, cursor: messageSuggestion.length });
      return;
    }
    if ((key.name === "up" || key.name === "down") && suggestions.length) {
      key.preventDefault();
      setSuggestionIndex(
        (index) =>
          (index + (key.name === "down" ? 1 : -1) + suggestions.length) % suggestions.length,
      );
      return;
    }
    if (key.name === "return" && !key.shift && !key.ctrl) {
      key.preventDefault();
      if (selectedSuggestion && value !== selectedSuggestion.command) completeCommand();
      else submit();
    }
  });

  return (
    <box flexDirection="column" flexShrink={flexShrink}>
      {queuedMessages.length > 0 && (
        <box
          flexDirection="column"
          maxHeight={7}
          overflow="hidden"
          backgroundColor="#263b2f"
          borderStyle="single"
          border={["left"]}
          borderColor={colors.green}
          paddingX={1}
          paddingTop={roomyQueue ? 1 : 0}
          paddingBottom={1}
          marginTop={roomyQueue ? 1 : 0}
          marginBottom={1}
        >
          <box flexDirection="row" justifyContent="space-between" width="100%" overflow="hidden">
            <text fg={colors.label}>{`QUEUED · ${queuedMessages.length}`}</text>
            {!disabled ? <text fg={colors.hint}>Ctrl+X remove newest</text> : null}
          </box>
          {queuePaused ? <text fg={colors.warning}>Paused · send a message to resume</text> : null}
          {queuePreviews.map((item, index) => (
            <text key={item.id} fg={colors.text}>
              {` ${index + 1}  ${item.text.replace(/\s+/g, " ")}`}
            </text>
          ))}
          {hiddenQueueCount > 0 ? (
            <text fg={colors.hint}>{` +${hiddenQueueCount} more`}</text>
          ) : null}
        </box>
      )}
      {suggestions.length > 0 && (
        <box flexDirection="column" marginBottom={1}>
          {suggestions.map((suggestion, index) => (
            <box key={suggestion.command} flexDirection="row" width="100%" overflow="hidden">
              <box width={commandColumnWidth} flexShrink={0}>
                <text fg={index === suggestionIndex ? colors.green : colors.hint}>
                  {index === suggestionIndex ? "› " : "  "}
                  {suggestion.command}{" "}
                </text>
              </box>
              <box flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
                <text fg={index === suggestionIndex ? colors.green : colors.hint}>
                  {suggestion.description}
                </text>
              </box>
            </box>
          ))}
        </box>
      )}
      <box flexDirection="row" width="100%" paddingLeft={1} paddingRight={1}>
        <box flexDirection="row" flexShrink={0}>
          <text fg={colors.green}>[</text>
          <LoadingIndicator color={colors.green} active={generating} />
          <text fg={colors.green}>]</text>
        </box>
        <box flexGrow={1} flexShrink={1} minWidth={0} alignItems="flex-end">
          <text fg={colors.hint}>
            {disabled
              ? generating
                ? `${onStopGeneration ? "Esc stop · " : ""}Ctrl+C interrupt`
                : ""
              : suggestions.length
                ? `↑↓ choose · Tab complete · Enter select/run${generating && onStopGeneration ? " · Esc stop" : ""}`
                : generating
                  ? `Enter queue · Ctrl+J newline${onStopGeneration ? " · Esc stop" : ""}`
                  : `${messageSuggestion && !value ? "Tab accept · " : ""}Ctrl+J newline · Enter send`}
          </text>
        </box>
      </box>
      <box
        flexDirection="column"
        border
        borderStyle="rounded"
        paddingX={1}
        minHeight={3}
        maxHeight={8}
        overflow="hidden"
      >
        <textarea
          key={placeholderKey.current}
          ref={inputRef}
          initialValue={draft?.value ?? ""}
          placeholder={
            disabled
              ? "Waiting for response…"
              : messageSuggestion && !value
                ? messageSuggestion
                : "Ask Xarab"
          }
          focused={!disabled}
          showCursor={!disabled}
          wrapMode="word"
          keyBindings={[
            { name: "return", shift: true, action: "newline" },
            { name: "return", action: "submit" },
            { name: "kpenter", action: "submit" },
            { name: "linefeed", action: "newline" },
          ]}
          onContentChange={updateDraft}
          onSubmit={() => {
            if (selectedSuggestion && value !== selectedSuggestion.command) completeCommand();
            else submit();
          }}
        />
        {contextTokens !== undefined && (
          <box
            flexDirection="row"
            flexShrink={0}
            justifyContent="flex-end"
            width="100%"
            overflow="hidden"
          >
            <text fg={colors.hint}>
              {contextTokens === null
                ? "Context unavailable"
                : `${contextTokens.toLocaleString("en-US")} tokens`}
            </text>
          </box>
        )}
      </box>
    </box>
  );
}
