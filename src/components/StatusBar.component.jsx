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

export function StatusBar({ sessionTitle, workspace }) {
  const renderer = useRenderer();
  const [width, setWidth] = useState(renderer.width);
  useOnResize((nextWidth) => setWidth(nextWidth));

  const available = Math.max(0, width - 2);
  const workspaceLimit =
    workspace && available > 1
      ? Math.min(stringWidth(workspace), Math.floor((available - 1) / 2))
      : 0;
  const visibleWorkspace = truncate(workspace || "", workspaceLimit);
  const leftLimit = available - (visibleWorkspace ? stringWidth(visibleWorkspace) + 1 : 0);
  const details = sessionTitle ? truncate(sessionTitle, leftLimit) : "";

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
