import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";
import { MessageCard } from "./message-card.component.jsx";

export function GeneratingMessage() {
  return (
    <MessageCard label="Assistant" color={colors.green}>
      <text fg={colors.hint} selectable>
        Generating…
      </text>
    </MessageCard>
  );
}
