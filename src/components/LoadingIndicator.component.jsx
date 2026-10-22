import React, { useEffect, useState } from "react";

const defaultFrames = [0, 1, 2, 3, 4, 3, 2, 1];
const barCount = 5;
const bar = "█";
const brightness = [0.25, 0.4, 0.65, 0.85, 1];

function shadeColor(color, factor) {
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (!match) return color;
  const hex = match[1].length === 3 ? match[1].replace(/(.)/g, "$1$1") : match[1];
  const channels = [0, 2, 4].map((offset) =>
    Math.round(parseInt(hex.slice(offset, offset + 2), 16) * factor),
  );
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export function LoadingIndicator({ color = "#263b2f", interval = 120, frames = defaultFrames }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, [frames, interval]);

  const activeBar = frames[frame];

  return (
    <text>
      {Array.from({ length: barCount }, (_, index) => {
        const distance = Math.abs(index - activeBar);
        const factor = brightness[Math.min(distance, brightness.length - 1)];
        return (
          <span key={index} fg={shadeColor(color, factor)}>
            {bar}
          </span>
        );
      })}
    </text>
  );
}
