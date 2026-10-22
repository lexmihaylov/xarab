import React, { useEffect, useState } from "react";

const defaultFrames = ["◐", "◓", "◑", "◒"];
export const brailleFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function CompactLoadingIndicator({ color, interval = 120, frames = defaultFrames }) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % frames.length);
    }, interval);
    return () => clearInterval(timer);
  }, [frames, interval]);

  return <text fg={color}>{frames[frame]}</text>;
}
