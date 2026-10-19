import hljs from "highlight.js/lib/common";
import { marked, Renderer } from "marked";

const escape = (text) =>
  String(text).replace(/[{}]/g, (character) => (character === "{" ? "{open}" : "{close}"));
const syntaxColors = {
  comment: "#657383",
  quote: "#657383",
  keyword: "#c792ea",
  selector: "#c792ea",
  built_in: "#c792ea",
  type: "#82aaff",
  title: "#82aaff",
  function: "#82aaff",
  class: "#82aaff",
  string: "#c3e88d",
  regexp: "#c3e88d",
  addition: "#c3e88d",
  number: "#f78c6c",
  literal: "#f78c6c",
  variable: "#f78c6c",
  meta: "#ffcb6b",
  attr: "#ffcb6b",
  property: "#82aaff",
  tag: "#f07178",
  name: "#f07178",
  operator: "#89ddff",
  punctuation: "#89ddff",
};

function decodeHtml(text) {
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|#39);/gi, (entity, name) => {
    if (name[0] === "#") {
      const point =
        name[1]?.toLowerCase() === "x"
          ? Number.parseInt(name.slice(2), 16)
          : Number.parseInt(name.slice(1), 10);
      return Number.isFinite(point) ? String.fromCodePoint(point) : entity;
    }
    return { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" }[name.toLowerCase()] ?? entity;
  });
}

function highlightedCode(html) {
  return html.replace(
    /<span class="([^"]*)">|<\/span>|&(?:#x[\da-f]+|#\d+|amp|lt|gt|quot|#39);|[^<&]+|</gi,
    (part, classNames) => {
      if (classNames !== undefined) {
        const token = classNames
          .split(/\s+/)
          .map((name) => name.replace(/^hljs-/, ""))
          .find((name) => syntaxColors[name] || name.startsWith("title"));
        const color = token?.startsWith("title") ? syntaxColors.title : syntaxColors[token];
        return color ? `{${color}-fg}` : "";
      }
      if (part === "</span>") return "{/}";
      return escape(decodeHtml(part));
    },
  );
}

export function renderMarkdown(markdown) {
  const renderer = new Renderer();

  renderer.heading = function ({ tokens, depth }) {
    const color = depth === 1 ? "#8fbfdc" : "#a8d5a2";
    return `{bold}{${color}-fg}${this.parser.parseInline(tokens)}{/${color}-fg}{/bold}\n\n`;
  };
  renderer.paragraph = function ({ tokens }) {
    return `${this.parser.parseInline(tokens)}\n\n`;
  };
  renderer.strong = function ({ tokens }) {
    return `{bold}${this.parser.parseInline(tokens)}{/bold}`;
  };
  renderer.em = function ({ tokens }) {
    return `{italic}${this.parser.parseInline(tokens)}{/italic}`;
  };
  renderer.del = function ({ tokens }) {
    return `{grey-fg}${this.parser.parseInline(tokens)}{/grey-fg}`;
  };
  renderer.codespan = ({ text }) => `{#e6b17e-fg}${escape(text)}{/}`;
  renderer.code = ({ text, lang }) => {
    const label = lang ? `{#657383-fg}${escape(lang)}{/}\n` : "";
    let highlighted = escape(text);
    if (lang && hljs.getLanguage(lang)) {
      highlighted = highlightedCode(
        hljs.highlight(text, { language: lang, ignoreIllegals: true }).value,
      );
    }
    const lines = highlighted.replace(/\n$/, "").split("\n");
    return `${label}{#c5d0dd-fg}${lines.map((line) => `  ${line}`).join("\n")}{/}\n\n`;
  };
  renderer.blockquote = function ({ tokens }) {
    return (
      this.parser
        .parse(tokens)
        .trimEnd()
        .split("\n")
        .map((line) => `{#657383-fg}│{/} ${line}`)
        .join("\n") + "\n\n"
    );
  };
  renderer.list = function ({ items, ordered, start }) {
    return (
      items
        .map((item, index) => {
          const marker = ordered ? `${Number(start || 1) + index}.` : "•";
          const content = this.parser.parse(item.tokens).trim().replaceAll("\n", "\n  ");
          const checkbox = item.task ? (item.checked ? "☑ " : "☐ ") : "";
          return `  {#8fbfdc-fg}${checkbox || marker}{/} ${content}`;
        })
        .join("\n") + "\n\n"
    );
  };
  renderer.table = function ({ header, rows }) {
    const allRows = [header, ...rows];
    const renderedRows = allRows.map((cells) =>
      cells.map((cell) => this.parser.parseInline(cell.tokens)),
    );
    const columnWidths = header.map((_, columnIndex) =>
      Math.max(1, ...renderedRows.map((row) => visibleText(row[columnIndex] ?? "").length)),
    );
    const renderRow = (cells, isHeader = false) =>
      cells
        .map((content, columnIndex) => {
          const padding = " ".repeat(columnWidths[columnIndex] - visibleText(content).length);
          const formatted = isHeader ? `{bold}${content}{/bold}` : content;
          return `${formatted}${padding}`;
        })
        .join("  │  ")
        .trimEnd();
    const divider = columnWidths.map((width) => "─".repeat(width)).join("──┼──");
    const [renderedHeader, ...renderedBody] = renderedRows;

    return `${renderRow(renderedHeader, true)}\n{#526273-fg}${divider}{/}\n${renderedBody
      .map((row) => renderRow(row))
      .join("\n")}\n\n`;
  };
  renderer.hr = () => "{#526273-fg}────────────────────────────────────────{/}\n\n";
  renderer.br = () => "\n";
  renderer.link = function ({ href, tokens }) {
    const label = this.parser.parseInline(tokens);
    const plainLabel = visibleText(label).trim();
    const destination = shouldShowLinkDestination(plainLabel, href)
      ? ` {#657383-fg}(${escape(href)}){/}`
      : "";
    const clickableLabel = isSafeHyperlink(href)
      ? `{link:${encodeURIComponent(href)}}${label}{/link}`
      : label;

    return `{#8fbfdc-fg}{underline}${clickableLabel}{/underline}{/}${destination}`;
  };
  renderer.image = ({ href, text }) => `${escape(text)} {#657383-fg}(${escape(href)}){/}`;
  renderer.html = ({ text }) => escape(text);
  renderer.text = function ({ text, tokens }) {
    return tokens ? this.parser.parseInline(tokens) : escape(text);
  };
  renderer.checkbox = ({ checked }) => (checked ? "☑ " : "☐ ");

  return marked.parse(markdown, { renderer, gfm: true, breaks: false });
}

function visibleText(markup) {
  return markup.replace(/\{[^{}]*\}/g, "");
}

function shouldShowLinkDestination(label, href) {
  if (!href || href.startsWith("mailto:")) return false;

  const normalizeAddress = (address) =>
    address
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .replace(/\/$/, "")
      .toLowerCase();

  return normalizeAddress(label) !== normalizeAddress(href);
}

function isSafeHyperlink(href) {
  return /^(https?:|mailto:)/i.test(href ?? "");
}
