import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";
import { OpenTuiMessageCard } from "./message-card.component.jsx";

export function OpenTuiAssistantMessage({
  message,
  responseText: providedText,
  generating,
  syntaxStyle,
}) {
  // A responseText prop is used for live timeline parts so text emitted after a
  // tool is rendered after that tool. The fallback keeps older saved sessions
  // compatible with the message field.
  const responseText =
    providedText ??
    (typeof message.message === "string"
      ? message.message
      : message.parts
          ?.filter((part) => part?.type === "text")
          .map((part) => (typeof part.text === "string" ? part.text : String(part.text ?? "")))
          .join("") || "");
  return (
    <box flexDirection="column" width="100%" minWidth={0} flexGrow={0} flexShrink={0}>
      {responseText.length > 0 && (
        <OpenTuiMessageCard bordered={false}>
          <markdown
            content={responseText}
            syntaxStyle={syntaxStyle}
            conceal
            concealCode
            streaming={Boolean(generating)}
            selectable
          />
        </OpenTuiMessageCard>
      )}
      {!responseText && generating && (
        <OpenTuiMessageCard bordered={false}>
          <text fg={colors.hint} selectable>
            Generating…
          </text>
        </OpenTuiMessageCard>
      )}
    </box>
  );
}
