import { formatMessageLines } from "./chat-view.js";
import { wrapChatLine } from "./chat-wrap.js";
import { createWelcomeMessage } from "./welcome-message.js";

function contentWidth(type, width) {
  const card = type === "user" || type === "shell" || type.startsWith("tool-");
  if (card) {
    const prefix = ["tool-running", "tool-complete", "tool-error"].includes(type) ? 2 : 0;
    return Math.max(1, width - 1 - (width > 3 ? 2 : 0) - prefix);
  }
  if (type.startsWith("welcome-")) return Math.max(1, width);
  return Math.max(1, width - (width > 2 ? 2 : 0));
}

export function buildChatRows(messages, width, { generating = false, height = 0 } = {}) {
  const rows = [];
  const append = (line, key) => {
    if (line.pixels || line.isPadding || line.type === "spacer" || line.type === "welcome-space") {
      rows.push({ ...line, key });
      return;
    }
    for (const [index, text] of wrapChatLine(line.text, contentWidth(line.type, width)).entries()) {
      rows.push({ ...line, text, key: `${key}:${index}` });
    }
  };
  if (!messages.length) {
    createWelcomeMessage({ width, height }).forEach((line, index) =>
      append(line, `welcome:${index}`),
    );
    const padding = Math.max(0, height - rows.length);
    const before = Math.floor(padding / 2);
    return [
      ...Array.from({ length: before }, (_, index) => ({
        text: "",
        type: "welcome-space",
        key: `welcome:top:${index}`,
      })),
      ...rows,
      ...Array.from({ length: padding - before }, (_, index) => ({
        text: "",
        type: "welcome-space",
        key: `welcome:bottom:${index}`,
      })),
    ];
  }
  messages.forEach((message, messageIndex) => {
    const key = `message:${messageIndex}`;
    const lines = formatMessageLines(message, { generating });
    const padded = message.type === "user" || message.type === "system";
    const type = lines[0]?.type ?? message.type;
    const severity = message.severity ?? "info";
    if (padded) append({ text: "", type, severity, isPadding: true }, `${key}:top`);
    if (message.type === "system") {
      const title =
        severity === "info"
          ? "System"
          : `System · ${severity[0].toUpperCase()}${severity.slice(1)}`;
      append({ text: title, type, severity, isHeading: true }, `${key}:heading`);
    }
    lines.forEach((line, index) => append(line, `${key}:body:${index}`));
    if (padded) append({ text: "", type, severity, isPadding: true }, `${key}:bottom`);
    if (lines.at(-1)?.type !== "spacer") append({ text: "", type: "spacer" }, `${key}:spacer`);
  });
  return rows;
}

export function chatViewport(rows, height, offset = 0) {
  const viewportHeight = Math.max(1, height);
  const maxScroll = Math.max(0, rows.length - viewportHeight);
  const scrollOffset = Math.max(0, Math.min(offset, maxScroll));
  const end = rows.length - scrollOffset;
  return {
    maxScroll,
    scrollOffset,
    visibleLines: rows.slice(Math.max(0, end - viewportHeight), end),
  };
}
