import React from "react";
import { renderScarab } from "./scarab-image.js";

const scarab = renderScarab({ width: 48, maxRows: 27 });

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

export function Welcome() {
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
