import test from "node:test";
import assert from "node:assert/strict";
import { renderScarab } from "../src/utils/scarab-image.js";
import { scarabArt } from "../src/utils/scarab-art.js";

test("renderScarab colors lower-half-only cells with the scarab palette", () => {
  const palette = scarabArt.palette.map((_, index) =>
    index ? `#${index.toString(16).padStart(6, "0")}` : undefined,
  );
  const rendered = renderScarab({ width: 48, maxRows: 27, palette });
  const cells = rendered.flat();

  assert.ok(cells.some(({ text, color }) => text.includes("▄") && color !== undefined));
});

test("renderScarab maps its art palette to interface colors", () => {
  const palette = scarabArt.palette.map((_, index) =>
    index ? `#${index.toString(16).padStart(6, "0")}` : undefined,
  );
  const rendered = renderScarab({ width: 20, maxRows: 8, palette });
  const colors = rendered.flat().flatMap(({ color, backgroundColor }) => [color, backgroundColor]);

  assert.ok(colors.some((color) => color !== undefined));
  assert.ok(colors.every((color) => color === undefined || palette.includes(color)));
});
