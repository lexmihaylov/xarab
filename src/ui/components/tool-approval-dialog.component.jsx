import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import wrapAnsi from "wrap-ansi";
import { browserColors as colors } from "../model-browser-theme.js";
import { Dialog } from "./dialog.component.jsx";

export function ToolApprovalDialog({
  type = "shell",
  command,
  reasons = [],
  width,
  height,
  onApprove,
  onDeny,
}) {
  const [commandOffset, setCommandOffset] = useState(0);
  const isWebsearch = type === "websearch";
  const isWebfetch = type === "webfetch";

  useInput((input, key) => {
    if (key.return || input.toLowerCase() === "y") return onApprove();
    if (key.escape || input.toLowerCase() === "n") return onDeny();
    if (key.upArrow) return setCommandOffset((offset) => Math.max(0, offset - 1));
    if (key.downArrow) return setCommandOffset((offset) => offset + 1);
    if (key.pageUp) return setCommandOffset((offset) => Math.max(0, offset - 8));
    if (key.pageDown) return setCommandOffset((offset) => offset + 8);
    if (key.home) return setCommandOffset(0);
    if (key.end) return setCommandOffset(Number.MAX_SAFE_INTEGER);
  });

  return (
    <Dialog
      title={
        isWebsearch
          ? "WEB SEARCH APPROVAL"
          : isWebfetch
            ? "WEB FETCH APPROVAL"
            : "SHELL COMMAND APPROVAL"
      }
      width={width}
      height={height}
      expanded
    >
      {({ contentWidth, dialogHeight }) => {
        const reasonWidth = Math.max(1, contentWidth - 4);
        const reasonLines = reasons.reduce(
          (total, reason) =>
            total + wrapAnsi(`• ${reason}`, reasonWidth, { hard: true }).split("\n").length,
          0,
        );
        const commandWidth = Math.max(1, contentWidth - 4);
        const commandLines = wrapAnsi(String(command ?? ""), commandWidth, {
          hard: true,
          trim: false,
        }).split("\n");
        const commandHeight = Math.max(3, dialogHeight - reasonLines - 17);
        const maxOffset = Math.max(0, commandLines.length - commandHeight);
        const offset = Math.min(commandOffset, maxOffset);
        const visibleCommand = commandLines.slice(offset, offset + commandHeight);
        const actionLabel = isWebsearch ? "search" : isWebfetch ? "fetch" : "run";
        const description = isWebsearch
          ? "This search query will be sent to Tavily."
          : isWebfetch
            ? "This URL will be requested directly."
            : "This command may have effects outside normal workspace operations.";

        return (
          <Box flexDirection="column" width={contentWidth} flexGrow={1} paddingX={1}>
            <Box width={contentWidth - 2} marginBottom={1}>
              <Text color={colors.warning} wrap="wrap">
                {description}
              </Text>
            </Box>
            {reasons.length > 0 && (
              <Box
                width={contentWidth}
                flexDirection="column"
                paddingX={1}
                paddingY={1}
                borderStyle="round"
                borderColor={colors.border}
                borderBackgroundColor="#202d38"
              >
                <Text bold color={colors.label}>
                  WHY APPROVAL IS REQUIRED
                </Text>
                {reasons.map((reason) => (
                  <Text key={reason} color={colors.text} wrap="wrap">
                    • {reason}
                  </Text>
                ))}
              </Box>
            )}
            <Box marginTop={1} width={contentWidth}>
              <Text bold color={colors.accent}>
                {isWebsearch ? "SEARCH QUERY" : isWebfetch ? "REQUEST URL" : "COMMAND"}
              </Text>
            </Box>
            <Box
              height={commandHeight + 2}
              width={contentWidth}
              paddingX={1}
              borderStyle="round"
              borderColor={maxOffset > 0 ? colors.accent : colors.border}
              borderBackgroundColor="#202d38"
              backgroundColor="#303b43"
              flexDirection="column"
              overflow="hidden"
            >
              {visibleCommand.map((line, index) => (
                <Text key={`${offset}-${index}`} color={colors.text} wrap="truncate">
                  {line || " "}
                </Text>
              ))}
            </Box>
            {maxOffset > 0 && (
              <Box height={1} paddingX={1}>
                <Text color={colors.hint} wrap="truncate">
                  ↑↓ scroll · PgUp/PgDn · {offset + 1}–{Math.min(offset + commandHeight, commandLines.length)} of {commandLines.length}
                </Text>
              </Box>
            )}
            <Box flexGrow={1} />
            <Box width={contentWidth} borderTop borderTopColor={colors.border} paddingTop={1}>
              <Text color={colors.muted} wrap="truncate">
                <Text bold color={colors.green}>Y / Enter</Text>{` approve ${actionLabel}   `}
                <Text bold color={colors.error}>N / Esc</Text> deny
              </Text>
            </Box>
          </Box>
        );
      }}
    </Dialog>
  );
}
