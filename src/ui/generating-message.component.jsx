import React from "react";
import { getTheme } from "./theme-engine.js";

const colors = getTheme().colors;
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
