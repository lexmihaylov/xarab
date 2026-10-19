import { renderMarkdown } from "./markdown.js";

const escapeMarkup = (text) =>
  String(text).replace(/[{}]/g, (character) => (character === "{" ? "{open}" : "{close}"));

export function formatChatMessage({ type, message }) {
  const renderedBody = message
    ? type === "agent"
      ? renderMarkdown(message)
      : escapeMarkup(message)
    : "";
  const body = type === "user" ? renderedBody.trimEnd() : renderedBody;
  return body;
}

function escapeToolText(text) {
  const visibleControls = String(text ?? "").replace(/[\u0000-\u001f\u007f]/g, (character) => {
    if (character === "\n") return character;
    return `\\x${character.charCodeAt(0).toString(16).padStart(2, "0")}`;
  });
  return escapeMarkup(visibleControls);
}

function formatToolPart(part) {
  const headingType =
    part.status === "running"
      ? "tool-running"
      : part.status === "error"
        ? "tool-error"
        : "tool-complete";
  const rows = [{ text: escapeToolText(part.title ?? part.label), type: headingType }];
  if (part.summary) rows.push({ text: escapeToolText(part.summary), type: "tool-detail" });
  if (part.diffText) {
    rows.push(
      ...part.diffText.split("\n").map((line) => ({
        text: escapeToolText(line),
        type:
          line.startsWith("+") && !line.startsWith("+++")
            ? "tool-diff-new"
            : line.startsWith("-") && !line.startsWith("---")
              ? "tool-diff-old"
              : "tool-detail",
      })),
    );
  }
  rows.push({ text: "", type: "tool-bottom" }, { text: "", type: "spacer" });
  return rows;
}

export function formatMessageLines(message, { generating = false } = {}) {
  if (message.type === "agent" && Array.isArray(message.parts)) {
    const rows = message.parts.flatMap((part) => {
      if (part.type === "text") {
        const rendered = renderMarkdown(part.text).trimEnd();
        return rendered ? rendered.split("\n").map((text) => ({ text, type: "agent" })) : [];
      }
      if (part.type === "tool") return formatToolPart(part);
      return [];
    });
    if (generating && !message.message && !message.parts.some((part) => part.type === "tool")) {
      rows.push({ text: "Generating", type: "generating" });
    }
    return rows;
  }

  const type =
    message.type === "system" && message.severity !== "info"
      ? `system-${message.severity}`
      : message.type;

  if (message.type === "system" || message.type === "intent") {
    const body = formatChatMessage(message);
    const bodyLines = body ? body.split("\n") : [""];
    return bodyLines.map((text) => ({ text, type, severity: message.severity }));
  }

  const formatted = formatChatMessage(message);
  return formatted
    ? formatted.split("\n").map((text) => ({ text, type, severity: message.severity }))
    : [];
}
