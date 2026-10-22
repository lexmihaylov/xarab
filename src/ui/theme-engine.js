const defaultTheme = {
  name: "default",
  colors: {
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
    overlay: "#202d38",
  },
  welcome: {
    brand: "#8fbfdc",
    heading: "#a8d5a2",
    copy: "#c5d0dd",
    hint: "#657383",
  },
  messages: {
    user: "#8fbfdc",
    agent: "#a8d5a2",
    system: "#aeb8c4",
    intent: "#657383",
  },
  markdown: {
    default: "#c5d0dd",
    keyword: "#c792ea",
    string: "#c3e88d",
    comment: "#657383",
    number: "#f78c6c",
    type: "#82aaff",
    heading: "#89ddff",
    list: "#f78c6c",
    quote: "#a6accd",
    link: "#80cbc4",
  },
};

const themes = new Map([[defaultTheme.name, defaultTheme]]);

function dimmedColors(theme) {
  return Object.fromEntries(
    Object.entries(theme.colors).map(([name, color]) => [
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
}

function validateTheme(theme) {
  if (!theme || typeof theme !== "object" || typeof theme.name !== "string") {
    throw new TypeError("A theme must have a name");
  }
  for (const section of ["colors", "welcome", "messages", "markdown"]) {
    if (!theme[section] || typeof theme[section] !== "object") {
      throw new TypeError(`Theme ${theme.name} is missing its ${section} colors`);
    }
    for (const token of Object.keys(defaultTheme[section])) {
      if (typeof theme[section][token] !== "string") {
        throw new TypeError(`Theme ${theme.name} is missing ${section}.${token}`);
      }
    }
  }
  return theme;
}

/**
 * Theme registry and lookup API. The default theme intentionally contains the
 * existing Xarab palette so introducing the engine does not change the UI.
 */
export function registerTheme(theme) {
  validateTheme(theme);
  themes.set(theme.name, theme);
  return theme;
}

export function getTheme(name = "default") {
  return themes.get(name) ?? defaultTheme;
}

export function getDimmedColors(theme = defaultTheme) {
  return dimmedColors(typeof theme === "string" ? getTheme(theme) : theme);
}

export function listThemes() {
  return [...themes.keys()];
}

export { defaultTheme };
