import React from "react";

export function MessageCard({
  label,
  color,
  children,
  backgroundColor,
  bordered = true,
  marginBottom = 1,
}) {
  return (
    <box
      flexDirection="column"
      marginBottom={marginBottom}
      minWidth={0}
      flexGrow={0}
      flexShrink={0}
      paddingX={1}
      {...(bordered
        ? {
            borderStyle: "single",
            border: ["left"],
            borderColor: color,
          }
        : {})}
      {...(backgroundColor ? { backgroundColor } : {})}
    >
      {label && (
        <text fg={color} bold selectable>
          {label}
        </text>
      )}
      <box flexDirection="column" minWidth={0} marginTop={label ? 1 : 0}>
        {children}
      </box>
    </box>
  );
}
