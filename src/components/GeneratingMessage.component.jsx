import React from "react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;
import { MessageCard } from "./MessageCard.component.jsx";

export function GeneratingMessage() {
  return (
    <MessageCard label="Assistant" color={colors.green}>
      <text fg={colors.hint} selectable>
        Generating…
      </text>
    </MessageCard>
  );
}
