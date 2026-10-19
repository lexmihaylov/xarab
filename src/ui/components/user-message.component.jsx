import React from "react";
import { Box, Text } from "ink";

export function UserMessage({ text, isPadding, width }) {
  return (
    <Box
      width={width}
      height={1}
      flexShrink={0}
      flexDirection="row"
      backgroundColor="#263b2f"
      borderStyle="single"
      borderTop={false}
      borderRight={false}
      borderBottom={false}
      borderLeft
      borderColor="#56b6c2"
      borderBackgroundColor="#263b2f"
      paddingX={width > 3 ? 1 : 0}
    >
      <Text color="#e6f4ea" wrap="truncate">
        {isPadding ? " " : text || " "}
      </Text>
    </Box>
  );
}
