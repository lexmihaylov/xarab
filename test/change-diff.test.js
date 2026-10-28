import assert from "node:assert/strict";
import test from "node:test";
import { parsePatch } from "diff";
import { formatChangeDiff, formatChangePreview } from "../src/utils/change-diff.js";

for (const [name, before, after] of [
  ["large creation", "", "new line\n".repeat(300)],
  ["large deletion", "old line\n".repeat(300), ""],
  ["large replacement", "old line\n".repeat(300), "new line\n".repeat(300)],
  ["long lines", "a".repeat(1000), "b".repeat(1000)],
  [
    "multiple hunks",
    Array.from({ length: 400 }, (_, i) => `${i}\n`).join(""),
    Array.from({ length: 400 }, (_, i) => `${i % 10 === 0 ? "changed" : i}\n`).join(""),
  ],
]) {
  test(`bounded preview remains valid: ${name}`, () => {
    const preview = formatChangePreview("sample.txt", before, after);
    const parsed = parsePatch(preview.diffText, { strict: true });
    assert.equal(parsed.length, 1);
    assert.ok(preview.diffNotice);
    assert.ok(parsed[0].hunks.reduce((total, hunk) => total + hunk.lines.length, 0) <= 100);
    assert.doesNotMatch(preview.diffText, /diff shortened|lines omitted|Preview shortened/);
  });
}

test("small previews have no truncation notice and preserve ordinary patches", () => {
  const preview = formatChangePreview("small.txt", "old\n", "new\n");
  assert.equal(preview.diffNotice, "");
  assert.equal(formatChangeDiff("small.txt", "old\n", "new\n"), preview.diffText);
  assert.match(preview.diffText, /-old\n\+new/);
  parsePatch(preview.diffText, { strict: true });
});
