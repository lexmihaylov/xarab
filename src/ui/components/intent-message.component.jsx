import React from "react";
import { Box, Text } from "ink";

export function IntentMessage({ text, width }) {
  return (
    <Box width={width} height={1} flexShrink={0} paddingX={width > 2 ? 1 : 0}>
      <Text color="#657383" wrap="truncate">
        {text}
      </Text>
    </Box>
  );
}
