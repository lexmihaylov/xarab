import { useEffect, useRef, useState } from "react";
import { useInput } from "ink";
import { previousTextPosition, nextTextPosition } from "../text-cursor.js";

const commandOptions = [
  { command: "/help", description: "Show available commands" },
  { command: "/route", description: "Configure router and tier workers" },
  { command: "/download", description: "Search Hugging Face for models" },
  { command: "/sessions", description: "Restore, switch, or delete sessions" },
  { command: "/new", description: "Start a new session" },
  { command: "/save", description: "Save or name this session" },
  { command: "/clear", description: "Clear the conversation" },
  { command: "/quit", description: "Exit Xarab" },
  { command: "/exit", description: "Exit Xarab" },
];

export function useComposer({
  onSubmit,
  onEscape,
  onInterrupt,
  onScroll,
  isActive,
  isGenerating = false,
  sessionId,
  initialDraft,
  onDraftChange,
  onSessions,
}) {
  const [value, setValue] = useState(initialDraft?.value ?? "");
  const [cursor, setCursor] = useState(initialDraft?.cursor ?? 0);
  const draftSession = useRef(sessionId);
  useEffect(() => {
    if (draftSession.current !== sessionId) {
      draftSession.current = sessionId;
      setValue(initialDraft?.value ?? "");
      setCursor(initialDraft?.cursor ?? 0);
      setSelectedSuggestionIndex(0);
      return;
    }
    onDraftChange?.({ value, cursor });
  }, [sessionId, value, cursor, onDraftChange]);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0);
  const suggestions =
    !isGenerating && value.startsWith("/") && !/[\s\n]/.test(value)
      ? commandOptions.filter(({ command }) => command.startsWith(value.toLowerCase()))
      : [];
  const selectedSuggestion = suggestions[Math.min(selectedSuggestionIndex, suggestions.length - 1)];

  function completeCommand(suggestion = selectedSuggestion) {
    if (!suggestion) return;
    const completed = ["/download", "/new", "/save"].includes(suggestion.command)
      ? `${suggestion.command} `
      : suggestion.command;
    setValue(completed);
    setCursor(completed.length);
  }

  useInput(
    (input, key) => {
      if (key.ctrl && input === "c") return onInterrupt();
      if (key.escape) return onEscape();
      if (key.pageUp || (key.ctrl && key.upArrow)) return onScroll(-1);
      if (key.pageDown || (key.ctrl && key.downArrow)) return onScroll(1);
      if (isGenerating) return;
      if (key.ctrl && input === "o") return onSessions?.();
      if (key.tab && suggestions.length) {
        completeCommand();
        return;
      }
      if (key.return && key.shift) {
        setValue((current) => `${current.slice(0, cursor)}\n${current.slice(cursor)}`);
        setCursor((position) => position + 1);
        return;
      }
      if (key.return) {
        if (selectedSuggestion && value !== selectedSuggestion.command) {
          completeCommand();
          return;
        }
        const submitted = value;
        setValue("");
        setCursor(0);
        if (submitted.trim()) onSubmit(submitted);
        return;
      }
      if (key.ctrl && input === "n") {
        setValue((current) => `${current.slice(0, cursor)}\n${current.slice(cursor)}`);
        setCursor((position) => position + 1);
        return;
      }
      if (key.leftArrow) return setCursor(previousTextPosition(value, cursor));
      if (key.rightArrow) return setCursor(nextTextPosition(value, cursor));
      if (key.home) return setCursor(0);
      if (key.end) return setCursor(value.length);
      if (key.backspace) {
        if (cursor > 0) {
          const previous = previousTextPosition(value, cursor);
          setValue((current) => current.slice(0, previous) + current.slice(cursor));
          setCursor(previous);
        }
        return;
      }
      if (key.delete) {
        setValue(
          (current) => current.slice(0, cursor) + current.slice(nextTextPosition(value, cursor)),
        );
        return;
      }
      if (key.upArrow || key.downArrow) {
        if (suggestions.length) {
          setSelectedSuggestionIndex(
            (index) => (index + (key.downArrow ? 1 : -1) + suggestions.length) % suggestions.length,
          );
          return;
        }
        const lineStart = value.lastIndexOf("\n", cursor - 1) + 1;
        const lineEnd = value.indexOf("\n", cursor);
        const column = cursor - lineStart;
        if (key.upArrow && lineStart > 0) {
          const previousEnd = lineStart - 1;
          const previousStart = value.lastIndexOf("\n", previousEnd - 1) + 1;
          setCursor(previousStart + Math.min(column, previousEnd - previousStart));
        } else if (key.downArrow && lineEnd !== -1) {
          const nextStart = lineEnd + 1;
          const nextEnd = value.indexOf("\n", nextStart);
          const end = nextEnd === -1 ? value.length : nextEnd;
          setCursor(nextStart + Math.min(column, end - nextStart));
        }
        return;
      }
      if (!key.ctrl && !key.meta && input) {
        setValue((current) => current.slice(0, cursor) + input + current.slice(cursor));
        setCursor((position) => position + input.length);
      }
    },
    { isActive },
  );

  return {
    value,
    cursor,
    suggestions,
    selectedSuggestionIndex: Math.min(selectedSuggestionIndex, Math.max(0, suggestions.length - 1)),
  };
}
