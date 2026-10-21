import React from "react";
import { CompactLoadingIndicator } from "./compact-loading-indicator.component.jsx";
import { ExecutionMessageCard } from "./execution-message-card.component.jsx";
import { browserColors as colors } from "./model-browser-theme.js";
import { shellSummary } from "./shell-summary.js";

const brailleFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const statusStyle = {
  running: { color: colors.warning, prefix: "…" },
  complete: { color: colors.accent, prefix: "" },
  error: { color: colors.error, prefix: "✕" },
};

export function ToolMessage({ part, syntaxStyle }) {
  const status = statusStyle[part.status] ?? statusStyle.complete;
  const title = String(part.title ?? part.label ?? "Tool");
  const rawSummary = part.summary == null ? "" : String(part.summary);
  const hidesOutputBody = part.toolName === "list_files" && part.status !== "error";
  const summary = hidesOutputBody
    ? ""
    : part.toolName === "run_command"
      ? shellSummary(rawSummary)
      : rawSummary;
  const diffText = typeof part.diffText === "string" ? part.diffText : "";

  const isError = part.status === "error";

  return (
    <ExecutionMessageCard
      color={status.color}
      prefix={
        part.status === "running" ? (
          <CompactLoadingIndicator color={status.color} frames={brailleFrames} />
        ) : (
          status.prefix
        )
      }
      title={title}
      summary={summary}
      error={isError}
    >
      {diffText && (
        <box padding={1} marginTop={1} backgroundColor={colors.background}>
          <diff
            diff={diffText}
            view="unified"
            syntaxStyle={syntaxStyle}
            wrapMode="char"
            conceal={false}
            fg={colors.text}
            // Show both diff signs and source line numbers.
            showLineNumbers
            addedSignColor={colors.green}
            removedSignColor={colors.error}
            selectable
          />
        </box>
      )}
    </ExecutionMessageCard>
  );
}
