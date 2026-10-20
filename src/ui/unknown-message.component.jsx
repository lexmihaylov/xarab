import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";
import { MessageCard } from "./message-card.component.jsx";

export function UnknownMessage({ type, message }) {
  return (
    <MessageCard label={type || "Message"} color={colors.text}>
      <text fg={colors.text} selectable wrapMode="word">
        {message == null ? " " : typeof message === "string" ? message : String(message)}
      </text>
    </MessageCard>
  );
}
