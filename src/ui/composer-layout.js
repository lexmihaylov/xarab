import wrapAnsi from "wrap-ansi";

export function getComposerRows({
  value,
  cursor = value.length,
  width,
  maxRows = 6,
  disabled = false,
  isActive = true,
}) {
  const text = disabled && !value ? "Waiting for response…" : value;
  // The input component displays an inverse space at the cursor position.
  const display = isActive && !disabled ? `${text.slice(0, cursor)} ${text.slice(cursor)}` : text;
  const normalized = display.replace(/\r\n?/g, "\n").replace(/\t/g, "    ");
  const lines = wrapAnsi(normalized, Math.max(1, width - 4), { hard: true, trim: false }).split(
    "\n",
  ).length;
  return Math.max(1, Math.min(maxRows, lines));
}
