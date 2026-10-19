import React from "react";
import { Box, Text } from "ink";

export function ShellMessage({ text, severity = "info", isPadding, width }) {
  const borderColor =
    severity === "error" ? "#ef7777" : severity === "warning" ? "#e6b17e" : "#56b6c2";

  return (
    <Box
      width={width}
      height={1}
      flexShrink={0}
      flexDirection="row"
      borderStyle="single"
      borderLeft
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderColor={borderColor}
      paddingX={width > 3 ? 1 : 0}
    >
      <Text wrap="truncate">{text}</Text>
    </Box>
  );
}
