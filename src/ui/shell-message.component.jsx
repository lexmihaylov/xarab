import React from "react";
import { ExecutionMessageCard } from "./execution-message-card.component.jsx";
import { browserColors as colors } from "./model-browser-theme.js";
import { shellSummary } from "./shell-summary.js";

const severityStyle = {
  info: { color: colors.accent, prefix: "" },
  warning: { color: colors.warning, prefix: "…" },
  error: { color: colors.error, prefix: "✕" },
};

export function ShellMessage({ message }) {
  const command = typeof message.command === "string" ? message.command : "";
  const output = shellSummary(message.message);
  const summary = [command && `> ${command}`, output].filter(Boolean).join("\n\n");
  const status = severityStyle[message.severity] ?? severityStyle.info;
  const isError = message.severity === "error";

  return (
    <ExecutionMessageCard
      color={status.color}
      prefix={status.prefix}
      title="Command injection"
      summary={summary}
      error={isError}
    />
  );
}
