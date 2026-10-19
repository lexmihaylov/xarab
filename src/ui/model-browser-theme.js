export const browserColors = {
  background: "#404040",
  selected: "#36566b",
  selectedText: "#f0f5f9",
  accent: "#8fbfdc",
  text: "#c5d0dd",
  label: "#a8d5a2",
  muted: "#aeb8c4",
  hint: "#657383",
  border: "#526273",
  green: "#a8d5a2",
  error: "#ef7777",
  warning: "#e6b17e",
};

// Simulate a 70% black scrim; the dialog uses the unmodified palette.
export const dimmedColors = Object.fromEntries(
  Object.entries(browserColors).map(([name, color]) => [
    name,
    `#${color
      .slice(1)
      .match(/../g)
      .map((channel) =>
        Math.round(Number.parseInt(channel, 16) * 0.3)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`,
  ]),
);
