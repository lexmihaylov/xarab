import React from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { browserColors as colors } from "./model-browser-theme.js";
import { OpenTuiModal } from "./modal.component.jsx";

function approvalTitle(type) {
  if (type === "websearch") return "WEB SEARCH APPROVAL";
  if (type === "webfetch") return "WEB FETCH APPROVAL";
  return "SHELL COMMAND APPROVAL";
}

function requestLabel(type) {
  if (type === "websearch") return "SEARCH QUERY";
  if (type === "webfetch") return "REQUEST URL";
  return "COMMAND";
}

function actionName(type) {
  if (type === "websearch") return "SEARCH";
  if (type === "webfetch") return "FETCH";
  return "RUN";
}

export function OpenTuiToolApprovalDialog({
  type = "shell",
  command,
  reasons = [],
  onApprove,
  onDeny,
}) {
  useKeyboard((key) => {
    if (key.name === "return" || (!key.ctrl && !key.meta && key.name === "y")) {
      key.preventDefault();
      onApprove();
    }
    if (key.name === "escape" || (!key.ctrl && !key.meta && key.name === "n")) {
      key.preventDefault();
      onDeny();
    }
  });

  const description =
    type === "websearch"
      ? "This search query will be sent to Tavily."
      : type === "webfetch"
        ? "This URL will be requested directly."
        : "This command may have effects outside normal workspace operations.";
  const { width: terminalWidth } = useTerminalDimensions();
  const sideBySide = reasons.length > 0 && terminalWidth >= 100;

  const reasonsPanel =
    reasons.length > 0 ? (
      <box
        flexDirection="column"
        flexGrow={sideBySide ? 1 : 0}
        height={sideBySide ? undefined : "32%"}
        minHeight={4}
        minWidth={0}
        border
        borderStyle="rounded"
        borderColor={colors.border}
        paddingX={1}
        paddingY={1}
      >
        <text fg={colors.label} bold flexShrink={0}>
          WHY APPROVAL IS REQUIRED
        </text>
        <scrollbox flexGrow={1} minHeight={0} scrollY>
          {reasons.map((reason, index) => (
            <text
              key={`${index}-${reason}`}
              fg={colors.text}
              wrapMode="word"
              marginTop={index === 0 ? 1 : 0}
            >
              {`• ${reason}`}
            </text>
          ))}
        </scrollbox>
      </box>
    ) : null;

  const requestPanel = (
    <box flexDirection="column" flexGrow={1} minHeight={0} minWidth={0}>
      <text fg={colors.accent} bold marginBottom={1} flexShrink={0}>
        {requestLabel(type)}
      </text>
      <scrollbox
        flexGrow={1}
        minHeight={0}
        scrollY
        border
        borderStyle="rounded"
        borderColor={colors.accent}
        backgroundColor="#303b43"
        focusedBackgroundColor="#303b43"
        paddingX={1}
        paddingY={1}
      >
        <text selectable fg={colors.text} wrapMode="word">
          {String(command ?? "")}
        </text>
      </scrollbox>
    </box>
  );

  return (
    <OpenTuiModal title={approvalTitle(type)} fullScreen>
      <box
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={colors.warning}
        paddingX={1}
        paddingY={1}
        marginBottom={1}
        flexShrink={0}
      >
        <text fg={colors.warning} bold>
          APPROVAL REQUIRED
        </text>
        <text fg={colors.muted} wrapMode="word">
          {description}
        </text>
      </box>

      <box
        flexDirection={sideBySide ? "row" : "column"}
        gap={1}
        flexGrow={1}
        minHeight={0}
        marginBottom={1}
      >
        {reasonsPanel}
        {requestPanel}
      </box>

      <box
        flexDirection="row"
        gap={2}
        flexShrink={0}
        border={["top"]}
        borderColor={colors.border}
        paddingTop={1}
      >
        <box
          flexDirection="column"
          flexGrow={1}
          minWidth={0}
          border
          borderStyle="rounded"
          borderColor={colors.green}
          paddingX={2}
          paddingY={1}
          height={4}
        >
          <text fg={colors.green} bold wrapMode="none">
            APPROVE {actionName(type)}
          </text>
          <text fg={colors.green} wrapMode="none">
            Y / ENTER
          </text>
        </box>
        <box
          flexDirection="column"
          flexGrow={1}
          minWidth={0}
          border
          borderStyle="rounded"
          borderColor={colors.error}
          paddingX={2}
          paddingY={1}
          height={4}
        >
          <text fg={colors.error} bold wrapMode="none">
            DENY
          </text>
          <text fg={colors.error} wrapMode="none">
            N / ESC
          </text>
        </box>
      </box>
    </OpenTuiModal>
  );
}
