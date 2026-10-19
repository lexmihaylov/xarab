import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

export function ToolMessage({ text, type, width }) {
  const isHeading = ["tool-running", "tool-complete", "tool-error"].includes(type);
  const isProgress = type === "tool-running";
  const glyph = type === "tool-bottom" ? "└" : isHeading ? "┌" : "│";
  const detailColor =
    type === "tool-error" || type === "tool-diff-old"
      ? "#ef7777"
      : type === "tool-diff-new"
        ? "#a8d5a2"
        : "#d0d0d0";

  return (
    <Box width={width} height={1} flexShrink={0} flexDirection="row" backgroundColor="#000000">
      <Text color="#657383">{glyph}</Text>
      <Box flexGrow={1} paddingX={width > 3 ? 1 : 0}>
        <Text color={detailColor} wrap="truncate">
          {isProgress ? (
            <>
              <Spinner type="dots" /> {text}
            </>
          ) : type === "tool-complete" ? (
            `✓ ${text}`
          ) : type === "tool-error" ? (
            `! ${text}`
          ) : (
            text
          )}
        </Text>
      </Box>
    </Box>
  );
}
