import React from "react";
import { Box, Text } from "ink";

export function AssistantMessage({ text, type, isPadding, width }) {
  const hasPadding = ["agent", "generating"].includes(type) || isPadding;

  if (!hasPadding) {
    return <Text wrap="truncate">{text}</Text>;
  }

  return (
    <Box width={width} height={1} flexShrink={0} paddingX={width > 2 ? 1 : 0}>
      <Text wrap="truncate">{text}</Text>
    </Box>
  );
}
