import React from "react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;
import { MessageCard } from "./MessageCard.component.jsx";

export function AssistantMessage({ message, responseText: providedText, generating, syntaxStyle }) {
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
        <MessageCard bordered={false}>
          {generating ? (
            <text fg={colors.text} selectable>
              {responseText}
            </text>
          ) : (
            <markdown
              content={responseText}
              syntaxStyle={syntaxStyle}
              conceal
              concealCode
              selectable
            />
          )}
        </MessageCard>
      )}
      {!responseText && generating && (
        <MessageCard bordered={false}>
          <text fg={colors.hint} selectable>
            Generating…
          </text>
        </MessageCard>
      )}
    </box>
  );
}
