import React from "react";
import { Box, Text } from "ink";

export function StatusBar({ status, sessionTitle, sessionError, width }) {
  const details = [sessionTitle ? `Session: ${sessionTitle.slice(0, 32)}` : "", status]
    .filter(Boolean)
    .join("  ·  ");
  const content = ` ${sessionError || details}`;
  const visibleContent = content.slice(0, width);
  return (
    <Box height={1} width={width}>
      <Text color={sessionError ? "#ef7777" : "#aeb8c4"}>{visibleContent.padEnd(width)}</Text>
    </Box>
  );
}
