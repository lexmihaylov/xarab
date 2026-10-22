import React from "react";
import { cleanModelText } from "./model-browser-view.js";
import { getTheme } from "./theme-engine.js";

const colors = getTheme().colors;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(1)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(2)} GB`;
}

export function DownloadProgressDialog({
  fileName,
  progress = 0,
  totalSize = 0,
  downloadedSize = 0,
  canceling,
}) {
  const percentage = Math.max(0, Math.min(100, Math.floor(progress * 100)));

  return (
    <box
      position="absolute"
      top="25%"
      left="15%"
      right="15%"
      zIndex={2}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={colors.accent}
      backgroundColor={colors.background}
      paddingY={1}
    >
      <box flexDirection="column" paddingX={2}>
        <text fg={colors.accent} bold>
          {canceling ? "CANCELING DOWNLOAD" : "DOWNLOADING MODEL"}
        </text>
        <text fg={colors.text} marginTop={1} truncate>
          {cleanModelText(fileName)}
        </text>
      </box>
      <box flexDirection="row" paddingX={2} marginTop={1}>
        <box width="100%" height={1} flexDirection="row" backgroundColor={colors.border}>
          {percentage > 0 && (
            <box width={`${percentage}%`} height={1} backgroundColor={colors.green} />
          )}
          {percentage < 100 && <box flexGrow={1} height={1} backgroundColor={colors.border} />}
        </box>
      </box>
      <box flexDirection="row" justifyContent="space-between" paddingX={2}>
        <text fg={colors.muted}>
          {formatBytes(downloadedSize)} /{" "}
          {totalSize > 0 ? formatBytes(totalSize) : "Waiting for file size…"}
        </text>
        <text fg={colors.accent} bold>
          {percentage}%
        </text>
      </box>
      <box flexDirection="column" paddingX={2}>
        <text fg={colors.muted} marginTop={1}>
          {canceling
            ? "Stopping download and removing partial files…"
            : "Downloading to your local model directory…"}
        </text>
        <box flexDirection="row" justifyContent="flex-end" marginTop={1}>
          <text fg={canceling ? colors.muted : colors.accent} bold>
            {canceling ? "Canceling…" : "Esc  Cancel download"}
          </text>
        </box>
      </box>
    </box>
  );
}
