import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";
import { OpenTuiMessageCard } from "./message-card.component.jsx";

function toText(value) {
  if (value == null) return " ";
  return typeof value === "string" ? value : String(value);
}

export function OpenTuiShellMessage({ message, severity }) {
  const isError = severity === "error";
  return (
    <OpenTuiMessageCard
      label={isError ? "Shell error" : "Shell"}
      color={isError ? colors.error : colors.accent}
    >
      <text fg={colors.text} selectable wrapMode="word">
        {toText(message)}
      </text>
    </OpenTuiMessageCard>
  );
}
