import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";

const severityStyles = {
  info: { label: "System", color: colors.accent },
  warning: { label: "Warning", color: colors.warning },
  error: { label: "Error", color: colors.error },
};

function toText(value) {
  if (value == null) return " ";
  return typeof value === "string" ? value : String(value);
}

export function OpenTuiSystemMessage({ text, severity = "info" }) {
  const style = severityStyles[severity] ?? severityStyles.info;

  return (
    <box
      flexDirection="column"
      minWidth={0}
      marginBottom={1}
      paddingLeft={1}
      paddingRight={1}
      borderStyle="single"
      border={["left"]}
      borderColor={style.color}
    >
      <text fg={style.color} bold selectable wrapMode="none">
        {style.label}
      </text>
      <text fg={colors.text} selectable wrapMode="word">
        {toText(text)}
      </text>
    </box>
  );
}
