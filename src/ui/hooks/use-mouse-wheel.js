import { useEffect, useRef } from "react";
import { useStdin, useStdout } from "ink";
import { isChatWheelRow, mouseWheelDirection } from "../terminal-utils.js";

export function useMouseWheel(onWheel, chatHeight, isActive = true) {
  const { stdin } = useStdin();
  const { stdout } = useStdout();
  const onWheelRef = useRef(onWheel);
  const chatHeightRef = useRef(chatHeight);
  onWheelRef.current = onWheel;
  chatHeightRef.current = chatHeight;

  useEffect(() => {
    if (!isActive || !stdin.isTTY || !stdout.isTTY) return undefined;
    let pending = "";
    const onData = (chunk) => {
      pending = (pending + chunk.toString("binary")).slice(-128);
      const wheel = mouseWheelDirection(pending);
      if (!wheel) return;
      pending = "";
      if (isChatWheelRow(wheel.y, chatHeightRef.current)) onWheelRef.current(wheel.direction);
    };

    stdout.write("\u001b[?1000h\u001b[?1006h");
    stdin.on("data", onData);
    return () => {
      stdin.removeListener("data", onData);
      stdout.write("\u001b[?1006l\u001b[?1000l");
    };
  }, [stdin, stdout, isActive]);
}
