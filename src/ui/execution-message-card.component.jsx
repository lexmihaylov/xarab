import React from "react";
import { getTheme } from "./theme-engine.js";

const colors = getTheme().colors;

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
        {prefix &&
          (React.isValidElement(prefix) ? (
            <box marginRight={1}>{prefix}</box>
          ) : (
            <text fg={error ? colors.error : color} bold selectable>
              {`${prefix} `}
            </text>
          ))}
        <text fg={error ? colors.error : color} bold selectable>
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
