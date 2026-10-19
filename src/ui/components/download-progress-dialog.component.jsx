import React from "react";
import { Box, Text, useInput } from "ink";
import { cleanModelText } from "../model-browser-view.js";
import { browserColors as colors } from "../model-browser-theme.js";

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function DownloadProgressDialog({
  width,
  height,
  fileName,
  progress = 0,
  totalSize = 0,
  downloadedSize = 0,
  canceling,
  onCancel,
}) {
  useInput((input, key) => {
    if (!canceling && (key.return || key.escape || input.toLowerCase() === "c")) onCancel();
  });
  const panelWidth = Math.max(1, Math.min(72, width - 4));
  const barWidth = Math.max(1, panelWidth - 12);
  const percentage = Math.max(0, Math.min(100, Math.floor(progress * 100)));
  const filled = Math.round((barWidth * percentage) / 100);
  return (
    <Box width={width} height={height} alignItems="center" justifyContent="center">
      <Box
        width={panelWidth}
        flexDirection="column"
        borderStyle="round"
        borderColor={colors.accent}
        borderBackgroundColor={colors.background}
        backgroundColor={colors.background}
        paddingX={2}
        paddingY={1}
        overflow="hidden"
      >
        <Text bold color={colors.accent}>
          {canceling ? "CANCELING DOWNLOAD" : "DOWNLOADING MODEL"}
        </Text>
        <Box marginTop={1}>
          <Text color={colors.text} wrap="truncate">
            {cleanModelText(fileName)}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text color={colors.green}>
            {"━".repeat(filled)}
            <Text color={colors.hint}>{"─".repeat(barWidth - filled)}</Text> {percentage}%
          </Text>
        </Box>
        <Text color={colors.muted}>
          {formatBytes(downloadedSize)} /{" "}
          {totalSize > 0 ? formatBytes(totalSize) : "Waiting for file size…"}
        </Text>
        <Box marginTop={1}>
          <Text color={colors.muted}>
            {canceling ? "… " : "↓ "}
            {canceling
              ? "Stopping download and removing partial files…"
              : "Downloading to your local model directory…"}
          </Text>
        </Box>
        <Box marginTop={1}>
          <Text
            bold
            color={canceling ? colors.muted : colors.selectedText}
            backgroundColor={canceling ? undefined : colors.selected}
          >
            {" "}
            {canceling ? "Canceling…" : "Cancel download"}{" "}
          </Text>
        </Box>
        <Text color={colors.hint}>
          {canceling ? "Please wait for cleanup to finish." : "Enter / Esc / C to cancel"}
        </Text>
      </Box>
    </Box>
  );
}
