import React from "react";
import { Box, Text } from "ink";
import { ControlledMultilineInput } from "ink-multiline-input";
import { getComposerRows } from "../composer-layout.js";

export function Composer({
  value,
  cursor,
  width,
  disabled = false,
  isActive = true,
  rows,
  maxRows = 6,
  suggestions = [],
  selectedSuggestionIndex = 0,
}) {
  const inputRows = rows ?? getComposerRows({ value, cursor, width, maxRows, disabled, isActive });
  return (
    <>
      {suggestions.length > 0 && (
        <Box flexDirection="column" width={width}>
          {suggestions.map(({ command, description }, index) => (
            <Box key={command} width={width}>
              <Text
                color={index === selectedSuggestionIndex ? "#a8d5a2" : "#657383"}
                wrap="truncate"
              >
                {index === selectedSuggestionIndex ? "› " : "  "}
                {command.padEnd(10)} {description}
              </Text>
            </Box>
          ))}
        </Box>
      )}
      <Box height={1} width={width} justifyContent="flex-end">
        <Text color="#657383">
          {disabled
            ? "Response generating · Esc stop · Ctrl+C interrupt"
            : suggestions.length
              ? "↑↓ choose · Tab complete · Enter select/run"
              : "PgUp/PgDn scroll · Enter send · Shift+Enter/Ctrl+N newline · Esc stop"}
        </Text>
      </Box>
      <Box
        flexDirection="column"
        height={inputRows + 2}
        width={width}
        borderStyle="round"
        borderColor="#526273"
        paddingX={1}
      >
        <ControlledMultilineInput
          value={disabled && !value ? "Waiting for response…" : value}
          cursorIndex={cursor ?? value.length}
          rows={inputRows}
          maxRows={inputRows}
          focus={isActive && !disabled}
          showCursor={isActive && !disabled}
          textStyle={{ color: "#e5e9f0" }}
        />
      </Box>
    </>
  );
}
