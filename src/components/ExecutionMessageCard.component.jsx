import React from "react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;

export function ExecutionMessageCard({
  color,
  prefix,
  title,
  summary,
  error,
  summaryMarkdown = false,
  syntaxStyle,
  headerChildren,
  children,
}) {
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
      {headerChildren}
      {summary && (
        <box padding={1} marginTop={1} backgroundColor={colors.background}>
          {summaryMarkdown ? (
            <markdown content={summary} syntaxStyle={syntaxStyle} conceal concealCode selectable />
          ) : (
            <text fg={error ? colors.error : colors.text} selectable>
              {summary}
            </text>
          )}
        </box>
      )}
      {children}
    </box>
  );
}
