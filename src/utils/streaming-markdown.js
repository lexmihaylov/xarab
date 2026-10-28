import { lexer } from "marked";

/** Keep the final top-level block literal until a subsequent block establishes its end.
 * Blank lines alone are not boundaries: lists and fenced code can contain them.
 * Completion (including interruption) restores full-source Markdown parsing.
 */
export function splitStreamingMarkdown(content, generating) {
  if (!generating) return { markdown: content, tail: "" };
  const source = content.replace(/\r\n?/g, "\n");
  const tokens = lexer(source);
  let offset = 0;
  let boundary = 0;
  for (const token of tokens) {
    const start = source.indexOf(token.raw, offset);
    if (start < 0) return { markdown: "", tail: source };
    if (token.type !== "space") boundary = start;
    offset = start + token.raw.length;
  }
  return { markdown: source.slice(0, boundary), tail: source.slice(boundary) };
}
