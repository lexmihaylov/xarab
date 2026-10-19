import React from "react";
import { Box, Text } from "ink";

export function SystemMessage({ text, severity = "info", isPadding, isHeading, width }) {
  const borderColor =
    severity === "error" ? "#ef7777" : severity === "warning" ? "#e6b17e" : "#aeb8c4";
  return (
    <Box
      width={width}
      height={1}
      flexShrink={0}
      flexDirection="row"
      backgroundColor={"#2c261f"}
      paddingX={width > 3 ? 1 : 0}
    >
      <Text bold={isHeading} color={isHeading ? borderColor : undefined} wrap="truncate">
        {isPadding ? " " : text || " "}
      </Text>
    </Box>
  );
}
