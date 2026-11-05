import React, { useState } from "react";
import { useOnResize, useRenderer } from "@opentui/react";
import stringWidth from "string-width";

function truncate(value, maxWidth) {
  if (maxWidth <= 0) return "";
  if (stringWidth(value) <= maxWidth) return value;
  const suffix = maxWidth > 3 ? "..." : "";
  let result = "";
  for (const { segment } of new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
    value,
  )) {
    if (stringWidth(result + segment) > maxWidth - suffix.length) break;
    result += segment;
  }
  return result + suffix;
}

export function StatusBar({ status, sessionTitle, sessionError, notice, workspace }) {
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

  const available = Math.max(0, width - 2);
  const routineStatus = !status || status === "Ready" || status === "Worker generating…";
  const statusText = routineStatus ? "" : truncate(status, available);
  const workspaceLimit =
    workspace && available > stringWidth(statusText) + 1
      ? Math.min(stringWidth(workspace), Math.floor((available - stringWidth(statusText) - 1) / 2))
      : 0;
  const visibleWorkspace = truncate(workspace || "", workspaceLimit);
  const leftLimit = available - (visibleWorkspace ? stringWidth(visibleWorkspace) + 1 : 0);
  const separator = "  ·  ";
  const titleLimit =
    leftLimit - stringWidth(statusText) - (statusText ? stringWidth(separator) : 0);
  const visibleTitle = sessionTitle ? truncate(sessionTitle, titleLimit) : "";
  const details = visibleTitle
    ? `${visibleTitle}${statusText ? `${separator}${statusText}` : ""}`
    : statusText;

  return (
    <box
      height={1}
      flexShrink={0}
      paddingLeft={1}
      paddingRight={1}
      overflow="hidden"
      flexDirection="row"
      justifyContent="space-between"
    >
      <text fg="#aeb8c4">{details}</text>
      {visibleWorkspace ? <text fg="#aeb8c4">{visibleWorkspace}</text> : null}
    </box>
  );
}
