import React from "react";
import { brailleFrames, CompactLoadingIndicator } from "./CompactLoadingIndicator.component.jsx";
import { ExecutionMessageCard } from "./ExecutionMessageCard.component.jsx";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;
import { shellSummary } from "../utils/shell-summary.js";

const severityStyle = {
  info: { color: colors.accent, prefix: "" },
  warning: { color: colors.warning, prefix: "…" },
  error: { color: colors.error, prefix: "✕" },
};

export function ShellMessage({ message }) {
  const command = typeof message.command === "string" ? message.command : "";
  const isRunning = message.running === true;
  const output = isRunning ? "Executing…" : shellSummary(message.message);
  const summary = [command && `> ${command}`, output].filter(Boolean).join("\n\n");
  const status = severityStyle[message.severity] ?? severityStyle.info;
  const isError = message.severity === "error";

  return (
    <ExecutionMessageCard
      color={isRunning ? colors.accent : status.color}
      prefix={
        isRunning ? (
          <CompactLoadingIndicator color={colors.accent} frames={brailleFrames} />
        ) : (
          status.prefix
        )
      }
      title="Command injection"
      summary={summary}
      error={isError}
    />
  );
}
