import wrapAnsi from "wrap-ansi";
import { renderScarab } from "./scarab-image.js";

const welcomeFooter = [
  { text: "", type: "welcome-space" },
  { text: "XARAB", type: "welcome-brand" },
  { text: "", type: "welcome-space" },
  { text: "AI CODING ASSISTANT", type: "welcome-heading" },
  { text: "Smart routing · workspace-aware tools", type: "welcome-copy" },
  { text: "", type: "welcome-space" },
  { text: "Ask a question or describe a change.", type: "welcome-copy" },
  { text: "Type !command to run a local command. · Ctrl+O saved sessions", type: "welcome-hint" },
];

export function createWelcomeMessage({ width = 80, height = 18 } = {}) {
  const columns = Math.max(1, width);
  const footerRows = welcomeFooter.reduce(
    (count, row) =>
      count +
      (row.type === "welcome-space"
        ? 1
        : wrapAnsi(row.text, columns, { hard: true, trim: false }).split("\n").length),
    0,
  );
  const maxRows = Math.max(1, Math.min(20, (height || 18) - footerRows));
  return [...renderScarab({ width: columns, maxRows }), ...welcomeFooter];
}
