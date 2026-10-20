import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";
import { MessageCard } from "./message-card.component.jsx";

function toText(value) {
  if (value == null) return " ";
  return typeof value === "string" ? value : String(value);
}

export function IntentMessage({ message }) {
  return (
    <MessageCard label="Routing" color={colors.hint}>
      <text fg={colors.text} selectable wrapMode="word">
        {toText(message) || " "}
      </text>
    </MessageCard>
  );
}
