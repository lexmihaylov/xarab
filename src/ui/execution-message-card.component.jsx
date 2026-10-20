import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";

export function ExecutionMessageCard({ color, prefix, title, summary, error, children }) {
  return (
    <box
      flexDirection="column"
      marginY={1}
      paddingLeft={1}
      borderStyle="single"
      border={["left"]}
      borderColor={color}
    >
      <box flexDirection="row">
        <text fg={error ? colors.error : color} bold selectable>
          {prefix ? `${prefix} ` : ""}
          {title}
        </text>
      </box>
      {summary && (
        <box padding={1} marginTop={1} backgroundColor={colors.background}>
          <text fg={error ? colors.error : colors.text} selectable>
            {summary}
          </text>
        </box>
      )}
      {children}
    </box>
  );
}
