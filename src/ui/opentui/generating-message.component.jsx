import React from "react";
import { browserColors as colors } from "../model-browser-theme.js";
import { OpenTuiMessageCard } from "./message-card.component.jsx";

export function OpenTuiGeneratingMessage() {
  return (
    <OpenTuiMessageCard label="Assistant" color={colors.green}>
      <text fg={colors.hint} selectable>
        Generating…
      </text>
    </OpenTuiMessageCard>
  );
}
