import React, { useEffect, useState } from "react";
import { useOnResize, useRenderer } from "@opentui/react";
import stringWidth from "string-width";
import { getGitBranch } from "../utils/git-branch.js";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;

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
  const [branch, setBranch] = useState(null);
  useOnResize((nextWidth) => setWidth(nextWidth));

  useEffect(() => {
    let active = true;
    let pending = false;
    setBranch(null);
    async function refresh() {
      if (pending) return;
      pending = true;
      const next = await getGitBranch(workspace);
      pending = false;
      if (active) setBranch(next);
    }
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [workspace]);

  const available = Math.max(0, width - 2);
  const rightBudget = Math.floor((available - 1) / 2);
  const branchReserve =
    branch && rightBudget >= 8 ? Math.min(stringWidth(branch) + 3, Math.floor(rightBudget / 2)) : 0;
  const workspaceLimit = workspace ? Math.max(0, rightBudget - 2 - branchReserve) : 0;
  const visibleWorkspace = truncate(workspace || "", workspaceLimit);
  const workspaceDetails = visibleWorkspace ? `⌂ ${visibleWorkspace}` : "";
  const branchBudget = Math.max(0, Math.floor(available / 2) - stringWidth(workspaceDetails) - 3);
  const visibleBranch = branch && branchBudget > 0 ? truncate(branch, branchBudget) : "";
  const rightDetails = `${workspaceDetails}${visibleBranch ? ` ⎇ ${visibleBranch}` : ""}`;
  const leftLimit = available - (rightDetails ? stringWidth(rightDetails) + 1 : 0);
  const titleLimit = Math.max(0, leftLimit - 2);
  const details = sessionTitle && leftLimit >= 2 ? `◷ ${truncate(sessionTitle, titleLimit)}` : "";

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
      <text fg={colors.hint}>{details}</text>
      {rightDetails ? <text fg={colors.hint}>{rightDetails}</text> : null}
    </box>
  );
}
