import React from "react";
import { browserColors as colors } from "./model-browser-theme.js";

// The scrim owns the complete terminal, while the centered panel has no extra
// border or background treatment of its own.
export function OpenTuiModal({
  title,
  children,
  width = "78%",
  height = "70%",
  fullScreen = false,
}) {
  return (
    <box
      position="absolute"
      top={0}
      right={0}
      bottom={0}
      left={0}
      zIndex={100}
      backgroundColor="#202d38"
      alignItems={fullScreen ? "stretch" : "center"}
      justifyContent={fullScreen ? "flex-start" : "center"}
    >
      <box
        flexDirection="column"
        width={fullScreen ? "100%" : width}
        height={fullScreen ? "100%" : height}
        paddingX={fullScreen ? 2 : 2}
        paddingY={fullScreen ? 1 : 1}
        overflow="hidden"
        position="relative"
      >
        <box justifyContent="center" marginBottom={1}>
          <text fg={colors.accent} bold>
            {title}
          </text>
        </box>
        {children}
      </box>
    </box>
  );
}
