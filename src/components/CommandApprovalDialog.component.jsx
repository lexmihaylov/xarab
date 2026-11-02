import React, { useRef, useState } from "react";
import { useKeyboard, useOnResize, useRenderer } from "@opentui/react";
import { Modal } from "./Modal.component.jsx";
import { getTheme } from "../utils/theme-engine.js";

// Escape terminal controls and bidi formatting rather than allowing disguised commands.
export function visibleCommand(text) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(
      /[\x00-\x09\x0b-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g,
      (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
    );
}

export function CommandApprovalDialog({ commandApproval, onAnswer }) {
  const colors = getTheme().colors;
  const renderer = useRenderer();
  const [size, setSize] = useState({ width: renderer.width, height: renderer.height });
  useOnResize((width, height) => setSize({ width, height }));
  const editor = useRef(null);
  const commandScroll = useRef(null);
  const detailsScroll = useRef(null);
  const [focus, setFocus] = useState("actions");
  const [action, setAction] = useState(1);
  const actions = ["Deny", "Approve"];
  const risk = commandApproval.risk.toUpperCase();
  const scope =
    commandApproval.scope === "outside"
      ? size.width < 60
        ? "OUTSIDE"
        : "OUTSIDE WORKSPACE"
      : commandApproval.scope.toUpperCase();
  const riskColor =
    commandApproval.risk === "high" || commandApproval.risk === "unclassified"
      ? colors.error
      : commandApproval.risk === "medium"
        ? colors.warning
        : colors.green;
  const finish = () =>
    onAnswer([
      {
        id: "command_approval",
        choices: [actions[action]],
        text: action === 0 ? (editor.current?.plainText ?? "") : "",
      },
    ]);
  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      key.preventDefault();
      onAnswer(null);
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      const areas = ["command", "details", "feedback", "actions"];
      setFocus(areas[(areas.indexOf(focus) + (key.shift ? areas.length - 1 : 1)) % areas.length]);
      return;
    }
    if ((focus === "command" || focus === "details") && ["up", "down"].includes(key.name)) {
      key.preventDefault();
      const scroll = focus === "command" ? commandScroll : detailsScroll;
      scroll.current?.scrollBy(key.name === "up" ? -1 : 1);
      return;
    }
    if (focus !== "actions") return;
    if (["left", "right", "up", "down"].includes(key.name)) {
      key.preventDefault();
      setAction(1 - action);
    } else if (key.name === "return" || key.name === "space") {
      key.preventDefault();
      finish();
    }
  });
  const width = Math.min(84, Math.max(1, size.width - 4));
  const height = Math.min(28, size.height - 4);
  if (width < 44 || height < 17)
    return (
      <Modal
        title="COMMAND APPROVAL"
        boundedBackdrop
        width={Math.max(1, width)}
        height={Math.max(1, Math.min(8, size.height))}
      >
        <text fg={colors.warning}>Enlarge the terminal to review this command.</text>
        <text fg={colors.muted}>Esc cancel · Approval is not granted</text>
      </Modal>
    );

  return (
    <Modal title="COMMAND APPROVAL" boundedBackdrop width={width} height={height}>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <box
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focus === "details" ? colors.accent : riskColor}
          paddingX={1}
          height={4}
          flexShrink={0}
        >
          <text fg={riskColor} bold height={1} flexShrink={0}>
            {`RISK: ${risk} · SCOPE: ${scope}`}
          </text>
          <scrollbox ref={detailsScroll} flexGrow={1} minHeight={0}>
            <text fg={colors.text}>{visibleCommand(commandApproval.reason)}</text>
            <text fg={colors.muted}>
              {visibleCommand(`Workspace: ${commandApproval.workspace}`)}
            </text>
          </scrollbox>
        </box>
        <box
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focus === "command" ? colors.accent : colors.border}
          paddingX={1}
          flexGrow={1}
          minHeight={4}
        >
          <text fg={colors.label} height={1} flexShrink={0}>
            COMMAND · controls escaped visibly
          </text>
          <scrollbox ref={commandScroll} flexGrow={1} minHeight={0}>
            <text fg={colors.text}>{visibleCommand(commandApproval.command)}</text>
          </scrollbox>
        </box>
        <box
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focus === "feedback" ? colors.accent : colors.border}
          paddingX={1}
          height={3}
          minHeight={3}
          flexShrink={0}
        >
          <text fg={colors.label} height={1} flexShrink={0}>
            OPTIONAL DENIAL FEEDBACK
          </text>
          <box height={1} minHeight={0} flexGrow={1} overflow="hidden">
            <textarea
              ref={editor}
              focused={focus === "feedback"}
              showCursor={focus === "feedback"}
              wrapMode="word"
              placeholder="Explain why or suggest a safer approach…"
              keyBindings={[{ name: "return", action: "newline" }]}
              flexGrow={1}
            />
          </box>
        </box>
      </box>
      <box flexDirection="row" justifyContent="flex-end" gap={2} flexShrink={0}>
        {actions.map((label, index) => (
          <box
            key={label}
            paddingX={1}
            backgroundColor={focus === "actions" && action === index ? colors.selected : undefined}
          >
            <text
              fg={
                focus === "actions" && action === index
                  ? colors.selectedText
                  : label === "Deny"
                    ? colors.warning
                    : colors.accent
              }
              bold
            >{`[ ${label} ]`}</text>
          </box>
        ))}
      </box>
      <text fg={colors.muted} flexShrink={0}>
        {focus === "feedback"
          ? "Enter newline · Tab next · Esc cancel"
          : focus === "actions"
            ? "←→ select · Enter · Tab · Esc cancel"
            : "↑↓ scroll · Tab next · Esc cancel"}
      </text>
    </Modal>
  );
}
