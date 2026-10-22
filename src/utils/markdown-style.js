import { RGBA, SyntaxStyle } from "@opentui/core";
import { getTheme } from "./theme-engine.js";

const color = (value) => RGBA.fromHex(value);

const colors = getTheme().markdown;

/**
 * Creates the syntax styles shared by code blocks and Markdown messages.
 * Keeping the style definitions here prevents renderer/bootstrap code from
 * also owning the presentation rules for Markdown.
 */
export function createMarkdownStyle(nativeScene) {
  return SyntaxStyle.fromStyles(
    {
      keyword: { fg: color(colors.keyword) },
      string: { fg: color(colors.string) },
      comment: { fg: color(colors.comment), italic: true },
      number: { fg: color(colors.number) },
      type: { fg: color(colors.type) },
      function: { fg: color(colors.type) },
      default: { fg: color(colors.default) },
      "markup.heading": { fg: color(colors.heading), bold: true },
      "markup.heading.1": { fg: color(colors.heading), bold: true },
      "markup.heading.2": { fg: color(colors.heading), bold: true },
      "markup.heading.3": { fg: color(colors.heading), bold: true },
      "markup.heading.4": { fg: color(colors.heading), bold: true },
      "markup.heading.5": { fg: color(colors.heading), bold: true },
      "markup.heading.6": { fg: color(colors.heading), bold: true },
      "markup.list": { fg: color(colors.list), bold: true },
      "markup.list.checked": { fg: color(colors.list), bold: true },
      "markup.list.unchecked": { fg: color(colors.list), bold: true },
      "markup.quote": { fg: color(colors.quote), italic: true },
      "markup.link.url": { fg: color(colors.link), underline: true },
      "markup.link.label": { fg: color(colors.link) },
    },
    nativeScene,
  );
}
