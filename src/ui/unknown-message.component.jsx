import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";
import { OpenTuiMessageCard } from "./message-card.component.jsx";

export function OpenTuiUnknownMessage({ type, message }) {
  return (
    <OpenTuiMessageCard label={type || "Message"} color={colors.text}>
      <text fg={colors.text} selectable wrapMode="word">
        {message == null ? " " : typeof message === "string" ? message : String(message)}
      </text>
    </OpenTuiMessageCard>
  );
}
