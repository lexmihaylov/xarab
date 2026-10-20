import React, { useEffect, useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";

const commandOptions = [
  { command: "/help", description: "Show available commands" },
  { command: "/route", description: "Configure router and tier workers" },
  { command: "/download", description: "Search Hugging Face for models" },
  { command: "/sessions", description: "Restore, switch, or delete sessions" },
  { command: "/new", description: "Start a new session" },
  { command: "/save", description: "Save or name this session" },
  { command: "/clear", description: "Clear the conversation" },
  { command: "/compact", description: "Summarize and compact the conversation" },
  { command: "/openai", description: "Show OpenAI command help" },
  { command: "/openai login", description: "Sign in to ChatGPT" },
  { command: "/openai copy", description: "Copy the sign-in URL" },
  { command: "/openai status", description: "Show OpenAI connection status" },
  { command: "/openai models", description: "List available OpenAI models" },
  { command: "/openai use", description: "Select an OpenAI model", acceptsArgument: true },
  { command: "/openai ask", description: "Ask OpenAI directly", acceptsArgument: true },
  { command: "/openai logout", description: "Sign out of ChatGPT" },
  { command: "/exit", description: "Exit Xarab" },
];

export function Composer({
  flexShrink = 0,
  sessionId,
  draft,
  disabled = false,
  onSubmit,
  onDraftChange,
  onStopGeneration,
  onSessions,
}) {
  const inputRef = useRef(null);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const [value, setValue] = useState(draft?.value ?? "");
  const sessionRef = useRef(sessionId);
  const suggestions =
    !disabled && value.startsWith("/") && !value.includes("\n")
      ? commandOptions.filter(({ command }) => command.startsWith(value.toLowerCase()))
      : [];
  const selectedSuggestion = suggestions[Math.min(suggestionIndex, suggestions.length - 1)];

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
    if (key.name === "tab" && suggestions.length) {
      key.preventDefault();
      completeCommand();
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
      {suggestions.length > 0 && (
        <box flexDirection="column" marginBottom={1}>
          {suggestions.map((suggestion, index) => (
            <text key={suggestion.command} fg={index === suggestionIndex ? "#a8d5a2" : "#657383"}>
              {index === suggestionIndex ? "› " : "  "}
              {suggestion.command.padEnd(10)} {suggestion.description}
            </text>
          ))}
        </box>
      )}
      <text fg="#657383">
        {disabled
          ? "Response generating · Esc stop · Ctrl+C interrupt"
          : suggestions.length
            ? "↑↓ choose · Tab complete · Enter select/run"
            : "PgUp/PgDn scroll · Enter send · Shift+Enter/Ctrl+N newline · Esc stop"}
      </text>
      <box border borderStyle="rounded" paddingX={1} minHeight={3} maxHeight={8}>
        <textarea
          ref={inputRef}
          initialValue={draft?.value ?? ""}
          placeholder={disabled ? "Waiting for response…" : "Ask Xarab"}
          focused={!disabled}
          showCursor={!disabled}
          wrapMode="word"
          keyBindings={[
            { name: "return", action: "submit" },
            { name: "kpenter", action: "submit" },
            { name: "return", shift: true, action: "newline" },
            { name: "kpenter", shift: true, action: "newline" },
          ]}
          onContentChange={updateDraft}
          onSubmit={() => {
            if (selectedSuggestion && value !== selectedSuggestion.command) completeCommand();
            else submit();
          }}
        />
      </box>
    </box>
  );
}
