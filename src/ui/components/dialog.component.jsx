import React from "react";
import { Box, Text } from "ink";

export function Dialog({ title, width, height, expanded = false, maxWidth = 84, children }) {
  const panelWidth = Math.max(1, Math.min(width - 2, maxWidth));
  const contentWidth = Math.max(1, panelWidth - 4);
  const dialogHeight = Math.max(
    1,
    Math.min(height - 2, expanded ? height - 2 : Math.floor(height / 2)),
  );

  return (
    <Box
      flexDirection="column"
      width={width}
      height={height}
      alignItems="center"
      justifyContent="center"
      backgroundColor="#202d38"
    >
      <Box
        flexDirection="column"
        width={panelWidth}
        height={dialogHeight}
        overflow="hidden"
        paddingX={2}
        paddingY={1}
      >
        <Box width={contentWidth} justifyContent="center" marginBottom={1}>
          <Text bold color="#8fbfdc">
            {title}
          </Text>
        </Box>
        {children({ contentWidth, dialogHeight })}
      </Box>
    </Box>
  );
}
