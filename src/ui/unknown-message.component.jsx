import React from "react";
import { getTheme } from "./theme-engine.js";

const colors = getTheme().colors;
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
