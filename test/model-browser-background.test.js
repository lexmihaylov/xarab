import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("browser paints its window and rounded borders with one opaque background", () => {
  // Color support is detected at import time, so render in a color-enabled process.
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
    import { ModelDownloader } from "./src/ui/components/model-downloader.component.jsx";
    process.stdout.write(renderToString(React.createElement(ModelDownloader, {
      width: 120, height: 30, downloads: [{
        name: "org/Coder", title: "Coder", parameters: "7B",
        files: [{ quantization: "Q4_K_M", fileName: "coder.gguf", size: 4000000000 }],
      }],
    })));
  `,
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, FORCE_COLOR: "3" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const lines = result.stdout.replace(/\u001b\[[\d;]*m/g, "").split("\n");
  assert.equal(lines[0].trim(), "", "The screen has top padding");
  assert.equal(lines.at(-1).trim(), "", "The screen has bottom padding");
  assert.ok(
    lines.every((line) => line.startsWith("  ") && line.endsWith("  ")),
    "Every row has horizontal screen padding",
  );
  assert.ok(
    result.stdout.includes("\u001b[38;2;168;213;162m"),
    "Headings use the home screen green",
  );
  assert.ok(
    result.stdout.includes("\u001b[38;2;174;184;196m"),
    "Secondary labels use the home screen gray",
  );
  assert.ok(result.stdout.includes("\u001b[38;2;143;191;220m"), "Titles use the home screen blue");
  assert.ok(
    result.stdout.includes("\u001b[38;2;197;208;221m"),
    "Body text uses the home screen light gray",
  );
  assert.ok(result.stdout.includes("\u001b[38;2;101;115;131m"), "Hints use the home screen slate");
  assert.ok(
    !result.stdout.includes("\u001b[38;2;154;174;193m"),
    "The old cool label color is not used",
  );
  let background;
  let foreground;
  let selectedCharacters = 0;
  let borders = 0;
  let cells = 0;
  for (const token of result.stdout.match(/\u001b\[[\d;]*m|[^\u001b]/gu) ?? []) {
    if (token.startsWith("\u001b[")) {
      const codes = token.slice(2, -1).split(";").map(Number);
      for (let index = 0; index < codes.length; index++) {
        const code = codes[index];
        if (code === 0) {
          background = undefined;
          foreground = undefined;
        } else if (code === 49) background = undefined;
        else if (code === 39) foreground = undefined;
        else if (code === 48 && codes[index + 1] === 2) {
          background = codes.slice(index + 2, index + 5).join(",");
          index += 4;
        } else if (code === 38 && codes[index + 1] === 2) {
          foreground = codes.slice(index + 2, index + 5).join(",");
          index += 4;
        }
      }
      continue;
    }
    if (token === "\n") continue;
    cells++;
    if (/[╭╮╰╯─│]/u.test(token)) {
      assert.equal(background, "64,64,64", `Unexpected background behind border ${token}`);
      borders++;
    } else {
      assert.ok(
        ["64,64,64", "54,86,107"].includes(background),
        `Missing window or highlight background behind ${JSON.stringify(token)}`,
      );
      if (background === "54,86,107" && token.trim()) {
        assert.equal(
          foreground,
          "240,245,249",
          `Selected text ${token} must contrast with its blue highlight`,
        );
        selectedCharacters++;
      }
    }
  }
  assert.ok(borders > 100, "Rounded borders must be present in the rendered output");
  assert.ok(selectedCharacters > 30, "Model, quantization and tab selections are rendered");
  assert.equal(cells, 120 * 30, "The background must cover the entire window");
});
