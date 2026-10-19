export function mouseWheelDirection(buffer) {
  const sgr = buffer.match(/\u001b\[<(64|65);\d+;(\d+)M/);
  if (sgr) return { direction: sgr[1] === "64" ? -1 : 1, y: Number(sgr[2]) };

  const legacy = buffer.match(/\u001b\[M([\s\S]{3})/);
  if (legacy) {
    const [button, , y] = [...legacy[1]].map((character) => character.charCodeAt(0));
    if (button >= 96 && button <= 97) return { direction: button === 96 ? -1 : 1, y: y - 32 };
  }
  return null;
}

export function nextScrollOffset(
  offset,
  direction,
  maxScroll,
  pageSize,
  step = Math.max(1, pageSize - 1),
) {
  return Math.max(0, Math.min(maxScroll, offset - direction * Math.max(1, step)));
}

export function isChatWheelRow(row, chatHeight) {
  return row >= 1 && row <= chatHeight;
}

export function toAnsi(text) {
  return (
    text.replace(/\{([^{}]+)\}/g, (_tag, value) => {
      if (value === "open") return "{";
      if (value === "close") return "}";
      if (value.startsWith("link:")) {
        const href = decodeURIComponent(value.slice("link:".length));
        return `\u001b]8;;${href}\u001b\\`;
      }
      if (value === "/link") return "\u001b]8;;\u001b\\";
      if (value === "bold") return "\u001b[1m";
      if (value === "italic") return "\u001b[3m";
      if (value === "underline") return "\u001b[4m";
      if (value === "/" || value.startsWith("/")) return "\u001b[0m";
      const color = value.match(/^#([\da-f]{6})-fg$/i);
      if (!color) return value === "grey-fg" ? "\u001b[90m" : "";
      const hex = color[1];
      return `\u001b[38;2;${Number.parseInt(hex.slice(0, 2), 16)};${Number.parseInt(hex.slice(2, 4), 16)};${Number.parseInt(hex.slice(4, 6), 16)}m`;
    }) + "\u001b[0m"
  );
}
