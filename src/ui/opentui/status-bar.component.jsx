import React, { useState } from "react";
import { useOnResize, useRenderer } from "@opentui/react";

function truncate(value, maxLength) {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength <= 3) return value.slice(0, maxLength);
  return `${value.slice(0, maxLength - 3)}...`;
}

export function OpenTuiStatusBar({ status, sessionTitle, sessionError, notice }) {
  const renderer = useRenderer();
  const [width, setWidth] = useState(renderer.width);
  useOnResize((nextWidth) => setWidth(nextWidth));

  const content = notice || sessionError;
  if (content) {
    return (
      <box height={1} flexShrink={0} paddingLeft={1} paddingRight={1} overflow="hidden">
        <text fg={sessionError ? "#f07178" : "#aeb8c4"}>{content}</text>
      </box>
    );
  }

  const statusText = status || "Ready";
  const prefix = sessionTitle ? "Session: " : "";
  const separator = sessionTitle ? "  ·  " : "";
  // Keep the title bounded even on wide terminals so status-bar information
  // remains visually secondary to the rest of the bar.
  const titleLimit = 32;
  const availableTitleLength = Math.max(
    0,
    width - 2 - prefix.length - separator.length - statusText.length,
  );
  const visibleTitle = sessionTitle
    ? truncate(sessionTitle, Math.min(titleLimit, availableTitleLength))
    : "";
  const details = `${prefix}${visibleTitle}${separator}${statusText}`;

  return (
    <box height={1} flexShrink={0} paddingLeft={1} paddingRight={1} overflow="hidden">
      <text fg="#aeb8c4">{details}</text>
    </box>
  );
}
