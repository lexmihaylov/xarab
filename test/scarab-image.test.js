import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { convertScarab } from "../scripts/generate-scarab.js";
import { scarabArt } from "../src/ui/scarab-art.js";
import { renderScarab } from "../src/ui/scarab-image.js";
import { createWelcomeMessage } from "../src/ui/welcome-message.js";

test("committed terminal artwork is reproducible from the supplied PNG", async () => {
  const source = await readFile(new URL("../assets/xarab.png", import.meta.url));
  assert.deepEqual(convertScarab(source), scarabArt);
  assert.equal(scarabArt.rows.length, scarabArt.height);
  assert.ok(
    scarabArt.rows.every((row) => row.length === scarabArt.width && /^[\da-f]+$/.test(row)),
  );
  assert.equal(scarabArt.palette[0], null, "The original black background is transparent");
  assert.ok(scarabArt.crop.y + scarabArt.crop.height < 928, "The baked-in wordmark is excluded");
});

test("colored block artwork fits its requested dimensions and preserves the palette", () => {
  for (const width of [1, 8, 20, 40, 80])
    for (const maxRows of [1, 6, 10, 20]) {
      const rows = renderScarab({ width, maxRows });
      assert.ok(rows.length > 0 && rows.length <= maxRows);
      for (const row of rows) {
        assert.ok(row.text.length > 0 && row.text.length <= width);
        assert.match(row.text, /^[█▀▄ ]+$/);
        assert.equal(row.pixels.map((pixel) => pixel.text).join(""), row.text);
        for (const pixel of row.pixels) {
          assert.ok(!pixel.color || scarabArt.palette.includes(pixel.color));
          assert.ok(!pixel.backgroundColor || scarabArt.palette.includes(pixel.backgroundColor));
          if (!pixel.color) assert.match(pixel.text, /^ +$/);
        }
      }
    }
  assert.equal(
    renderScarab({ width: 80, maxRows: 10 }),
    renderScarab({ width: 80, maxRows: 10 }),
    "Repeated renders reuse the cached artwork",
  );
});

test("welcome artwork resizes while leaving space for the name and welcome copy", () => {
  for (const height of [18, 24, 32]) {
    const rows = createWelcomeMessage({ width: 80, height });
    assert.ok(rows.length <= height);
    assert.ok(rows.find((row) => row.type === "welcome-brand" && row.text === "XARAB"));
    assert.ok(rows.find((row) => row.type === "welcome-hint"));
  }
  const small = createWelcomeMessage({ width: 80, height: 18 }).filter(
    (row) => row.type === "welcome-logo",
  );
  const large = createWelcomeMessage({ width: 80, height: 32 }).filter(
    (row) => row.type === "welcome-logo",
  );
  assert.ok(large.length > small.length);
  assert.ok(large[0].text.length > small[0].text.length);
});

test("welcome uses native text colors for gold and blue pixels without image protocols", () => {
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--input-type=module",
      "-e",
      `
    import React from "react";
    import { renderToString } from "ink";
    import { ChatPanel } from "./src/ui/components/chat-panel.component.jsx";
    import { buildChatRows } from "./src/ui/chat-layout.js";
    const rows = buildChatRows([], 80, { height: 32 });
    process.stdout.write(renderToString(React.createElement(ChatPanel, { lines: rows, width: 80, height: 32 })));
  `,
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, FORCE_COLOR: "3" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const codes = [...result.stdout.matchAll(/\u001b\[38;2;(\d+);(\d+);(\d+)m/g)].map((match) =>
    match.slice(1).map(Number),
  );
  assert.ok(
    codes.some(([r, g, b]) => r > 180 && g > 100 && b < 130),
    "Gold colors survive rendering",
  );
  assert.ok(
    codes.some(([r, g, b]) => b > r * 2 && b > 70),
    "Blue colors survive rendering",
  );
  assert.ok(
    result.stdout.includes("\u001b[48;2;"),
    "Half-blocks can render two pixel colors per cell",
  );
  assert.ok(
    !result.stdout.includes("\u001b_G") &&
      !result.stdout.includes("\u001bP") &&
      !result.stdout.includes("\u001b]1337;"),
    "No terminal graphics protocol is needed",
  );
});
