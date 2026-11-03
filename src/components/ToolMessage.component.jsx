import React from "react";
import { brailleFrames, CompactLoadingIndicator } from "./CompactLoadingIndicator.component.jsx";
import { ExecutionMessageCard } from "./ExecutionMessageCard.component.jsx";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;
import { shellSummary } from "../utils/shell-summary.js";

const statusStyle = {
  running: { color: colors.warning, prefix: "…" },
  complete: { color: colors.accent, prefix: "" },
  error: { color: colors.error, prefix: "✕" },
};

export function ToolMessage({ part, syntaxStyle, activityExpanded = false, onToggleActivity }) {
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
      {part.toolName === "task" && (part.taskAgent || part.taskExecution) && (
        <text fg={colors.muted} selectable>
          {[part.taskAgent && `Agent: ${part.taskAgent}`, part.taskExecution]
            .filter(Boolean)
            .join(" · ")}
        </text>
      )}
      {part.toolName === "task" && part.taskActivity?.length > 0 && (
        <box flexDirection="column">
          <text fg={colors.accent} onMouseUp={onToggleActivity}>
            {`${activityExpanded ? "▾" : "▸"} Activity (${part.taskActivity.length}) · click to toggle · Ctrl+T all`}
          </text>
          {activityExpanded &&
            part.taskActivity.map((item, index) => (
              <text
                key={index}
                fg={item.status === "error" ? colors.error : colors.muted}
                selectable
              >
                {`${item.status === "running" ? "…" : item.status === "error" ? "✕" : item.status === "unknown" ? "?" : "✓"} ${item.label}${item.status === "unknown" ? " (outcome unknown)" : ""}`}
              </text>
            ))}
        </box>
      )}
      {diffText && (
        <box flexDirection="column" padding={1} marginTop={1} backgroundColor={colors.background}>
          {part.diffNotice && <text fg={colors.muted}>{part.diffNotice}</text>}
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
