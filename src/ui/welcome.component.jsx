import React from "react";
import { useTerminalDimensions } from "@opentui/react";
import { renderScarab } from "./scarab-image.js";

const footer = [
  ["XARAB", "brand"],
  ["AI CODING ASSISTANT", "heading"],
  ["Smart routing · workspace-aware tools", "copy"],
  ["", "space"],
  ["Ask a question or describe a change.", "copy"],
  ["Type !command to run a local command. · Ctrl+O saved sessions", "hint"],
];

const colors = {
  brand: "#8fbfdc",
  heading: "#a8d5a2",
  copy: "#c5d0dd",
  hint: "#657383",
};

// The composer uses four rows at its minimum size and the status bar uses one.
const appChromeRows = 5;
const maxImageWidth = 40;
const maxImagePixels = 23;

export function Welcome() {
  const { width: terminalWidth, height: terminalHeight } = useTerminalDimensions();
  const imageRows = Math.max(1, terminalHeight - appChromeRows - footer.length);
  const scarab = renderScarab({
    width: Math.min(maxImageWidth, Math.max(1, terminalWidth - 2)),
    // Each terminal row of the image contains two image pixels.
    maxRows: Math.min(maxImagePixels, imageRows * 2),
  });

  return (
    <box
      flexDirection="column"
      flexGrow={1}
      minHeight="100%"
      alignItems="center"
      justifyContent="center"
      width="100%"
    >
      <box flexDirection="column" alignSelf="center">
        {scarab.map((row, rowIndex) => (
          <text key={rowIndex}>
            {row.map(({ text, color, backgroundColor }, pixelIndex) => (
              <span key={pixelIndex} fg={color} bg={backgroundColor}>
                {text}
              </span>
            ))}
          </text>
        ))}
      </box>
      {footer.map(([text, type]) =>
        type === "space" ? (
          <text key={`${type}-${text}`}> </text>
        ) : (
          <text key={text} fg={colors[type]} bold={type === "brand" || type === "heading"}>
            {text}
          </text>
        ),
      )}
    </box>
  );
}
