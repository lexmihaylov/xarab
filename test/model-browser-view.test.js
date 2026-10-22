import assert from "node:assert/strict";
import test from "node:test";
import stringWidth from "string-width";
import { modelDetailRows, compactCount } from "../src/utils/model-browser-view.js";

const model = { name: "publisher/Coder", parameters: "7B" };
const details = {
  metadata: {
    gguf: { total: 7000000000, architecture: "coder", context_length: 32768 },
    cardData: { license: "apache-2.0", language: ["en", "fr"] },
    lastModified: "2026-10-15T08:45:01Z",
    custom: { extra: "Only in metadata" },
  },
  modelCard:
    "---\nlicense: apache-2.0\n---\n# Getting started\n**Important**\n- Download a file\n```sh\necho hello\n```",
};

test("overview groups readable fields and leaves raw metadata and documentation out", () => {
  const rows = modelDetailRows(model, details, 70, "Overview");
  assert.deepEqual(
    rows.filter((row) => row.kind === "heading").map((row) => row.text),
    ["MODEL SPECIFICATIONS", "LICENSE & LINEAGE", "COMMUNITY & AVAILABILITY", "REPOSITORY"],
  );
  assert.equal(rows.find((row) => row.label === "Context length").text, "32,768 tokens");
  assert.equal(rows.find((row) => row.label === "Updated").text, "2026-10-15");
  assert.equal(rows.find((row) => row.label === "Languages").text, "en, fr");
  assert.ok(!rows.some((row) => /Only in metadata|Getting started/.test(row.text)));
  assert.equal(rows.find((row) => row.label === "Architecture").labelWidth, 15);
});

test("model card has readable headings, lists, and code without duplicated front matter", () => {
  const rows = modelDetailRows(model, details, 70, "Model card");
  assert.ok(rows.some((row) => row.kind === "heading" && row.text === "Getting started"));
  assert.ok(rows.some((row) => row.kind === "code" && row.text === "  echo hello"));
  assert.ok(rows.some((row) => row.text.includes("• Download a file")));
  assert.ok(rows.some((row) => row.text === "Important"));
  assert.ok(!rows.some((row) => /license:|```/.test(row.text)));
});

test("metadata retains unfamiliar fields and wraps long paths and values", () => {
  const rows = modelDetailRows(model, details, 24, "Metadata");
  const text = rows.map((row) => `${row.label ?? ""} ${row.text}`).join("\n");
  assert.match(text, /custom.extra/);
  assert.match(text, /Only in metadata/);
  assert.match(text, /gguf.context_length/);
  assert.ok(rows.every((row) => row.text.length + (row.labelWidth ? row.labelWidth + 2 : 0) <= 24));
});

test("missing dates and fields use a consistent placeholder", () => {
  const rows = modelDetailRows(model, { metadata: { lastModified: "invalid" } }, 70);
  assert.equal(rows.find((row) => row.label === "Updated").text, "Not provided");
  assert.equal(rows.find((row) => row.label === "Architecture").text, "Not provided");
  assert.equal(compactCount(123456), "123.5K");
  assert.equal(compactCount(undefined), "—");
});

test("model card tables have aligned columns, readable headers and Markdown alignment", () => {
  const rows = modelDetailRows(
    model,
    {
      modelCard: [
        "| **Quantization** | Size | Quality |",
        "| :--- | ---: | :---: |",
        "| `Q4_K_M` | 4 GB | Good |",
        "| Q8_0 | 8 GB | Best |",
      ].join("\n"),
    },
    70,
    "Model card",
  );
  assert.equal(rows[0].kind, "table-heading");
  assert.match(rows[0].text, /^Quantization\s+│\s+Size\s+│\s+Quality/);
  assert.match(rows[1].text, /^─+┼─+┼─+$/);
  assert.match(rows[2].text, /^Q4_K_M\s+│ 4 GB │\s+Good/);
  const separators = rows
    .filter((row) => row.text.includes("│"))
    .map((row) => [...row.text.matchAll(/│/g)].map((match) => match.index));
  assert.ok(
    separators.every((columns) => JSON.stringify(columns) === JSON.stringify(separators[0])),
  );
  assert.ok(!rows.some((row) => /\*\*|`|---/.test(row.text)));
});

test("table cells wrap inside their columns without losing content in narrow panes", () => {
  const rows = modelDetailRows(
    model,
    {
      modelCard: [
        "| Variant | Notes |",
        "| --- | --- |",
        "| Q4_K_M | A longer explanation for smaller terminals |",
      ].join("\n"),
    },
    24,
    "Model card",
  );
  assert.ok(rows.every((row) => stringWidth(row.text) <= 24));
  assert.ok(rows.length > 3);
  assert.match(
    rows
      .filter((row) => row.kind === "text")
      .map((row) => row.text.split("│")[1].trim())
      .join(" "),
    /A longer explanation for smaller terminals/,
  );
});

test("tables preserve escaped pipes, Unicode cells, and inline link labels", () => {
  const rows = modelDetailRows(
    model,
    {
      modelCard: [
        "| Model | Notes |",
        "| --- | --- |",
        "| 中文模型 | a\\|b |",
        "| [Coder](https://example.com) | Fast |",
      ].join("\n"),
    },
    32,
    "Model card",
  );
  assert.ok(rows.every((row) => stringWidth(row.text) <= 32));
  assert.match(rows.map((row) => row.text).join("\n"), /a\|b/);
  assert.match(rows.map((row) => row.text).join("\n"), /Coder/);
  assert.ok(!rows.some((row) => row.text.includes("https://example.com")));
  const data = rows.filter((row) => row.kind === "text");
  assert.equal(stringWidth(data[0].text.split("│")[0]), stringWidth(data[1].text.split("│")[0]));
});

test("tables too wide for the pane fall back to readable labeled rows", () => {
  const rows = modelDetailRows(
    model,
    {
      modelCard: ["A | B | C | D", "--- | --- | --- | ---", "one | two | three | four"].join("\n"),
    },
    10,
    "Model card",
  );
  assert.ok(rows.some((row) => row.kind === "heading" && row.text === "ROW 1"));
  assert.match(rows.map((row) => row.text).join("\n"), /one[\s\S]*two[\s\S]*three[\s\S]*four/);
});

test("table-like content in fenced code remains code", () => {
  const rows = modelDetailRows(
    model,
    { modelCard: "```md\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```" },
    50,
    "Model card",
  );
  assert.ok(!rows.some((row) => row.kind === "table-heading"));
  assert.ok(rows.some((row) => row.kind === "code" && row.text.includes("| --- | --- |")));
});
