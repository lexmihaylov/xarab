#!/usr/bin/env node

import React, { useState } from "react";
import { createCliRenderer } from "@opentui/core";
import { createRoot, useKeyboard, useRenderer, useSelectionHandler } from "@opentui/react";
import { copyToClipboard } from "./agent/clipboard.js";

function Message({ label, color, children }) {
  return (
    <box flexDirection="column" marginBottom={1}>
      <text fg={color} bold>
        {label}
      </text>
      <text selectable>{children}</text>
    </box>
  );
}

function VerificationApp() {
  const renderer = useRenderer();
  const [notice, setNotice] = useState("Drag over chat text to test selection");

  useSelectionHandler((selection) => {
    const text = selection.getSelectedText();
    if (!text.trim()) return;

    void copyToClipboard(text).then((copied) => {
      setNotice(copied ? "Selected chat text copied" : "Selection created (clipboard unavailable)");
    });
  });

  useKeyboard((key) => {
    if (key.name === "q" || key.name === "escape") renderer.destroy();
  });

  return (
    <box flexDirection="column" padding={1}>
      <text fg="cyan" bold>
        OpenTUI selection verification
      </text>
      <text marginBottom={1}>
        Drag across only the messages below. The composer and status area are separate.
      </text>

      <box flexDirection="column" border borderStyle="rounded" padding={1}>
        <Message label="You" color="green">
          Explain how application-owned terminal selection differs from native selection.
        </Message>
        <Message label="Assistant" color="cyan">
          OpenTUI owns the selection geometry, highlights the selected cells, and exposes the
          selected text to the application for clean clipboard handling.
        </Message>
        <Message label="Tool" color="yellow">
          $ echo "This tool output is also selectable"
        </Message>
      </box>

      <box marginTop={1} border borderStyle="single" padding={1}>
        <text fg="gray">{notice}</text>
      </box>
      <text marginTop={1} fg="gray">
        Press Escape or q to exit.
      </text>
    </box>
  );
}

const renderer = await createCliRenderer({
  screenMode: "alternate-screen",
  useMouse: true,
});

createRoot(renderer).render(<VerificationApp />);
