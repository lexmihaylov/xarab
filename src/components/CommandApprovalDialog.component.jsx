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
  const [focus, setFocus] = useState("command");
  const [action, setAction] = useState(0);
  const actions = ["Deny", "Approve once"];
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
      const areas = ["command", "feedback", "actions"];
      setFocus(areas[(areas.indexOf(focus) + (key.shift ? 2 : 1)) % 3]);
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
      <text fg={colors.muted} flexShrink={0}>
        Review this exact command before it runs
      </text>
      <box flexDirection="column" flexGrow={1} minHeight={0} marginY={1}>
        <box
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focus === "command" ? colors.accent : colors.border}
          paddingX={1}
          flexGrow={1}
          minHeight={0}
        >
          <text fg={colors.label} height={1} flexShrink={0}>
            COMMAND · controls escaped visibly
          </text>
          <scrollbox focused={focus === "command"} flexGrow={1} minHeight={0}>
            <text fg={colors.text}>{visibleCommand(commandApproval.command)}</text>
          </scrollbox>
        </box>
        <text fg={colors.warning} flexShrink={0} marginTop={1}>
          {visibleCommand(
            `${commandApproval.risk} · ${commandApproval.scope}: ${commandApproval.reason}`,
          )}
        </text>
        <text fg={colors.muted} flexShrink={0}>
          {visibleCommand(`Workspace: ${commandApproval.workspace}`)}
        </text>
        <box
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focus === "feedback" ? colors.accent : colors.border}
          paddingX={1}
          height={5}
          minHeight={5}
          marginTop={1}
          flexShrink={0}
        >
          <text fg={colors.label} height={1} flexShrink={0}>
            OPTIONAL DENIAL FEEDBACK
          </text>
          <box height={4} minHeight={0} flexGrow={1} overflow="hidden">
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
      <text fg={colors.muted} flexShrink={0} marginTop={1}>
        {focus === "feedback"
          ? "Enter newline · Tab actions · Esc cancel"
          : focus === "actions"
            ? "←→ action · Enter select · Tab · Esc cancel"
            : "↑↓ scroll · Tab feedback/actions · Esc cancel"}
      </text>
    </Modal>
  );
}
