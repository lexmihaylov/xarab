import React from "react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;
import { MessageCard } from "./MessageCard.component.jsx";

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
