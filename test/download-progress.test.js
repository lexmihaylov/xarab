import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import React from "react";
import { render } from "ink";
import { ModelDownloader } from "../src/ui/components/model-downloader.component.jsx";

test("the progress dialog dims the browser without dimming itself and restores colors afterward", () => {
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
    const props = { width: 80, height: 24, downloads: [], downloadFileName: "coder.gguf" };
    const draw = (extra) => renderToString(React.createElement(ModelDownloader, { ...props, ...extra }));
    process.stdout.write(JSON.stringify([
      draw({}),
      draw({ downloading: "https://example.com/coder.gguf" }),
      draw({ downloading: "https://example.com/coder.gguf", canceling: true }),
      draw({ downloading: null }),
    ]));
  `,
    ],
    {
      cwd: new URL("..", import.meta.url),
      env: { ...process.env, FORCE_COLOR: "3" },
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  const [normal, active, canceling, restored] = JSON.parse(result.stdout);
  assert.ok(normal.includes("\u001b[48;2;64;64;64m"));
  for (const output of [active, canceling]) {
    assert.ok(
      output.includes("\u001b[48;2;19;19;19m"),
      "The browser background is darkened by 70%",
    );
    assert.ok(output.includes("\u001b[38;2;43;57;66m"), "The browser text is dimmed too");
    assert.ok(
      output.includes("\u001b[48;2;64;64;64m"),
      "The dialog uses the browser's normal background",
    );
    assert.ok(output.includes("\u001b[38;2;143;191;220m"), "The dialog keeps its bright title");
    assert.ok(
      !output.includes("\u001b[48;2;40;40;40m"),
      "The old dialog background is no longer used",
    );
  }
  assert.equal(restored, normal);
});

test("progress captures keyboard input and keeps the browser blocked during cancellation", async (t) => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  stdout.columns = 80;
  stdout.rows = 24;
  stdout.resume();
  const stderr = new PassThrough();
  stderr.resume();
  let output = "";
  stdout.on("data", (chunk) => {
    output += chunk;
  });
  let cancellations = 0,
    closes = 0,
    searches = 0;
  const props = {
    width: 80,
    height: 24,
    downloads: [],
    query: "coder",
    downloading: "https://example.com/coder.gguf",
    progress: 0.5,
    onCancelDownload: () => {
      cancellations++;
    },
    onClose: () => {
      closes++;
    },
    onSearch: () => {
      searches++;
    },
  };
  const instance = render(React.createElement(ModelDownloader, props), {
    stdin,
    stdout,
    stderr,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  t.after(() => {
    instance.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });
  await delay(60);
  assert.match(output, /DOWNLOADING MODEL/);
  assert.match(output, /50%/);
  stdin.write("\u001b");
  await delay(40);
  assert.equal(cancellations, 1);
  assert.equal(closes, 0);
  instance.rerender(React.createElement(ModelDownloader, { ...props, canceling: true }));
  await delay(40);
  stdin.write("\r");
  stdin.write("\u001b");
  await delay(40);
  assert.equal(cancellations, 1);
  assert.equal(searches, 0);
  assert.equal(closes, 0);
  assert.match(output, /CANCELING DOWNLOAD/);
  instance.rerender(
    React.createElement(ModelDownloader, {
      ...props,
      downloading: null,
      downloadNotice: "Download canceled. Partial files removed.",
    }),
  );
  await delay(40);
  stdin.write("\u001b");
  await delay(40);
  assert.equal(closes, 1);
});
