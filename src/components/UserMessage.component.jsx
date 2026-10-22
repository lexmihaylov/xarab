import React, { useEffect, useState } from "react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;

function toText(value) {
  if (value == null) return " ";
  return typeof value === "string" ? value : String(value);
}

const loadingFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function UserMessage({ message, classification }) {
  const [frame, setFrame] = useState(0);
  const classifying = classification?.status === "classifying";

  useEffect(() => {
    if (!classifying) return undefined;
    const timer = setInterval(
      () => setFrame((current) => (current + 1) % loadingFrames.length),
      100,
    );
    return () => clearInterval(timer);
  }, [classifying]);

  return (
    <box flexDirection="column" marginBottom={1} minWidth={0}>
      <box
        flexDirection="column"
        minWidth={0}
        paddingTop={1}
        paddingBottom={1}
        paddingLeft={1}
        paddingRight={1}
        borderStyle="single"
        border={["left"]}
        borderColor={colors.green}
        backgroundColor="#263b2f"
      >
        <text fg={colors.text} selectable wrapMode="word">
          {toText(message).trimEnd() || " "}
        </text>
      </box>
      {classifying && (
        <box flexDirection="row" justifyContent="flex-end" width="100%" marginTop={1}>
          <text fg={colors.green}>{loadingFrames[frame]} Classifying…</text>
        </box>
      )}
      {classification?.status === "done" && (
        <box flexDirection="column" alignItems="flex-end" width="100%" marginTop={1}>
          <text fg={colors.green}>
            Tier {classification.tier} · {toText(classification.model)}
            {Number.isFinite(classification.confidence) &&
              ` (${Math.round(classification.confidence * 100)}%)`}
          </text>
          {classification.rationale && (
            <text fg={colors.muted} wrapMode="word">
              {classification.rationale}
            </text>
          )}
        </box>
      )}
    </box>
  );
}
