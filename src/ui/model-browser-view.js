import wrapAnsi from "wrap-ansi";
import stringWidth from "string-width";
import { marked } from "marked";

export const cleanModelText = (value) =>
  String(value ?? "Not provided").replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "");

const value = (item) =>
  Array.isArray(item) ? item.join(", ") || "Not provided" : (item ?? "Not provided");
const date = (item) =>
  item && !Number.isNaN(Date.parse(item))
    ? new Date(item).toISOString().slice(0, 10)
    : "Not provided";
export const compactCount = (number) =>
  Number.isFinite(number)
    ? new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number)
    : "—";

export function modelOverview(model, details) {
  const metadata = details?.metadata ?? {};
  const card = metadata.cardData ?? {};
  const config = metadata.config ?? {};
  const parameters = metadata.gguf?.total ?? metadata.safetensors?.total;
  const context =
    metadata.gguf?.context_length ??
    config.max_position_embeddings ??
    config.text_config?.max_position_embeddings;
  const section = (text) => ({ kind: "heading", text });
  const field = (label, text) => ({ kind: "field", label, text: String(value(text)) });
  return [
    section("MODEL SPECIFICATIONS"),
    field(
      "Parameters",
      parameters
        ? parameters.toLocaleString("en-US")
        : model.parameters
          ? `~${model.parameters} (from name)`
          : null,
    ),
    field("Architecture", metadata.gguf?.architecture ?? config.architectures ?? config.model_type),
    field(
      "Context length",
      Number.isFinite(context) ? `${context.toLocaleString("en-US")} tokens` : context,
    ),
    field("Task", metadata.pipeline_tag),
    { kind: "space", text: "" },
    section("LICENSE & LINEAGE"),
    field("License", card.license),
    field("Languages", card.language),
    field("Base model", card.base_model),
    { kind: "space", text: "" },
    section("COMMUNITY & AVAILABILITY"),
    field("Downloads", metadata.downloads ?? model.downloads),
    field("Likes", metadata.likes ?? model.likes),
    field("Updated", date(metadata.lastModified)),
    field("Created", date(metadata.createdAt)),
    field(
      "Access",
      metadata.gated
        ? `Gated (${metadata.gated})`
        : metadata.gated === false
          ? "Public download"
          : null,
    ),
    field(
      "Visibility",
      metadata.private === true ? "Private" : metadata.private === false ? "Public" : null,
    ),
    { kind: "space", text: "" },
    section("REPOSITORY"),
    field("Repository", model.name),
    field("Publisher", metadata.author ?? model.publisher ?? model.name.split("/")[0]),
    field("Tags", metadata.tags ?? model.tags),
    field("URL", `https://huggingface.co/${model.name}`),
  ];
}

function inlineTableText(tokens) {
  return tokens
    .map((token) => {
      if (token.type === "br" || (token.type === "html" && /^<br\s*\/?\s*>$/i.test(token.text)))
        return "\n";
      if (token.tokens) return inlineTableText(token.tokens);
      return token.text ?? token.raw ?? "";
    })
    .join("");
}

function modelTableRows(table, width) {
  const cells = [table.header, ...table.rows].map((row) =>
    row.map((cell) => inlineTableText(cell.tokens)),
  );
  const columns = table.header.length;
  const budget = width - 3 * (columns - 1);
  if (budget < columns) {
    // Preserve every cell when the table has too many columns for the pane.
    return cells.slice(1).flatMap((row, index) => [
      { kind: "heading", text: `ROW ${index + 1}` },
      ...row.map((text, column) => ({
        kind: "field",
        label: cells[0][column] || `Column ${column + 1}`,
        text,
      })),
      { kind: "space", text: "" },
    ]);
  }
  const desired = table.header.map((_, column) =>
    Math.max(
      1,
      ...cells.flatMap((row) => (row[column] ?? "").split("\n").map((line) => stringWidth(line))),
    ),
  );
  const widths = desired.map((size) => Math.min(size, Math.floor(budget / columns)));
  let remaining = budget - widths.reduce((sum, size) => sum + size, 0);
  while (remaining > 0 && widths.some((size, column) => size < desired[column])) {
    for (let column = 0; column < columns && remaining > 0; column++) {
      if (widths[column] < desired[column]) {
        widths[column]++;
        remaining--;
      }
    }
  }
  const rows = [];
  for (const [index, row] of cells.entries()) {
    const wrapped = widths.map((size, column) =>
      wrapAnsi(row[column] ?? "", size, { hard: true, trim: true }).split("\n"),
    );
    // A wide glyph cannot fit in a one-column cell. Use the readable stacked layout instead.
    if (wrapped.some((lines, column) => lines.some((line) => stringWidth(line) > widths[column]))) {
      return modelTableRows(table, 0);
    }
    const height = Math.max(...wrapped.map((lines) => lines.length));
    for (let line = 0; line < height; line++) {
      rows.push({
        kind: index === 0 ? "table-heading" : "text",
        text: wrapped
          .map((lines, column) => {
            const text = lines[line] ?? "";
            const padding = widths[column] - stringWidth(text);
            const left =
              table.align[column] === "right"
                ? padding
                : table.align[column] === "center"
                  ? Math.floor(padding / 2)
                  : 0;
            return " ".repeat(left) + text + " ".repeat(padding - left);
          })
          .join(" │ "),
      });
    }
    if (index === 0)
      rows.push({ kind: "muted", text: widths.map((size) => "─".repeat(size)).join("─┼─") });
  }
  return rows;
}

function modelCardRows(details, width) {
  if (!details?.modelCard)
    return [{ kind: "muted", text: details?.modelCardError || "Model card not loaded yet." }];
  // Front matter is already represented by the overview and metadata tabs.
  const text = cleanModelText(details.modelCard).replace(
    /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/,
    "",
  );
  const plainRows = (text) => {
    let code = false;
    return text
      .trim()
      .split("\n")
      .map((line) => {
        if (/^\s*```/.test(line)) {
          code = !code;
          return { kind: "muted", text: code ? `CODE ${line.trim().slice(3)}` : "" };
        }
        if (code) return { kind: "code", text: `  ${line}` };
        if (/^#{1,6}\s/.test(line)) return { kind: "heading", text: line.replace(/^#+\s+/, "") };
        return {
          kind: "text",
          text: line.replace(/^\s*[-*]\s+/, " • ").replace(/\*\*([^*]+)\*\*/g, "$1"),
        };
      });
  };
  const rows = [];
  let pending = "";
  for (const token of marked.lexer(text.trim(), { gfm: true })) {
    if (token.type !== "table") {
      pending += token.raw;
      continue;
    }
    if (pending) rows.push(...plainRows(pending));
    pending = "";
    rows.push(...modelTableRows(token, Math.max(1, width)));
  }
  if (pending) rows.push(...plainRows(pending));
  return rows;
}

function metadataRows(details) {
  if (!details) return [{ kind: "muted", text: "Additional metadata will appear after loading." }];
  const rows = [];
  const visit = (item, path) => {
    if (item !== null && typeof item === "object" && Object.keys(item).length) {
      if (
        Array.isArray(item) &&
        item.every((entry) => entry === null || typeof entry !== "object")
      ) {
        rows.push({ kind: "field", label: path, text: item.join(", ") });
      } else {
        rows.push({ kind: "heading", text: path || "REPOSITORY METADATA" });
        for (const [key, child] of Object.entries(item))
          visit(child, path ? `${path}.${key}` : key);
      }
    } else rows.push({ kind: "field", label: path, text: JSON.stringify(item) ?? "Not provided" });
  };
  visit(details.metadata, "");
  return rows;
}

export function modelDetailRows(model, details, width, tab = "Overview") {
  if (!model) return [{ kind: "muted", text: "Select a model to inspect its details." }];
  const rows =
    tab === "Model card"
      ? modelCardRows(details, Math.max(1, width))
      : tab === "Metadata"
        ? metadataRows(details)
        : modelOverview(model, details);
  const available = Math.max(1, width);
  const labelWidth = Math.min(15, Math.floor(available * 0.38));
  return rows.flatMap((row) => {
    if (row.kind === "field") {
      // Long metadata paths get their own line rather than stealing value space.
      const longLabel = row.label.length > labelWidth;
      const prefix = longLabel ? "  " : "";
      const valueWidth = Math.max(1, available - (longLabel ? 2 : labelWidth + 2));
      const values = wrapAnsi(cleanModelText(row.text), valueWidth, {
        hard: true,
        trim: false,
      }).split("\n");
      return [
        ...(longLabel
          ? wrapAnsi(cleanModelText(row.label), available, { hard: true })
              .split("\n")
              .map((text) => ({ kind: "muted", text }))
          : []),
        ...values.map((text, index) => ({
          kind: "field",
          label: !longLabel && index === 0 ? row.label : "",
          labelWidth: longLabel ? 0 : labelWidth,
          text: prefix + text,
        })),
      ];
    }
    return wrapAnsi(cleanModelText(row.text), available, { hard: true, trim: false })
      .split("\n")
      .map((text) => ({ ...row, text }));
  });
}

export function modelDetailLines(model, details, width) {
  return ["Overview", "Model card", "Metadata"].flatMap((tab) =>
    modelDetailRows(model, details, width, tab).map((row) =>
      row.label ? `${row.label}: ${row.text}` : row.text,
    ),
  );
}
