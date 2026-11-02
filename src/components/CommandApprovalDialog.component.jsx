import React, { useRef, useState } from "react";
import { useKeyboard } from "@opentui/react";
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
  return (
    <Modal title="COMMAND APPROVAL" fullScreen>
      <scrollbox
        focused={focus === "command"}
        flexGrow={1}
        minHeight={0}
        border
        borderColor={focus === "command" ? colors.accent : colors.border}
      >
        <text fg={colors.warning}>
          {visibleCommand(
            `${commandApproval.risk} · ${commandApproval.scope}: ${commandApproval.reason}`,
          )}
        </text>
        <text fg={colors.muted}>{visibleCommand(`Workspace: ${commandApproval.workspace}`)}</text>
        <text fg={colors.label}>COMMAND (controls and backslashes escaped)</text>
        <text fg={colors.text}>{visibleCommand(commandApproval.command)}</text>
      </scrollbox>
      <text fg={colors.label} height={1} flexShrink={0}>
        Optional denial feedback
      </text>
      <textarea
        ref={editor}
        height={4}
        flexShrink={0}
        focused={focus === "feedback"}
        showCursor={focus === "feedback"}
        wrapMode="word"
        placeholder="Explain why or suggest a safer approach…"
        keyBindings={[{ name: "return", action: "newline" }]}
      />
      <box flexDirection="row" gap={3} height={1} flexShrink={0}>
        {actions.map((label, index) => (
          <text
            key={label}
            fg={focus === "actions" && action === index ? colors.accent : colors.text}
          >
            {action === index ? "› " : "  "}
            {label}
          </text>
        ))}
      </box>
      <text fg={colors.muted} height={2} flexShrink={0}>
        Tab: command / feedback / actions · Arrows: scroll or select · Enter: confirm action · Esc:
        cancel
      </text>
    </Modal>
  );
}
