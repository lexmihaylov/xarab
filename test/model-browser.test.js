import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import React from "react";
import { render } from "ink";
import { ModelDownloader } from "../src/ui/components/model-downloader.component.jsx";

for (const width of [50, 80, 120]) {
  test(`browser navigates models, quantizations and details at ${width} columns`, async (t) => {
    const stdin = new PassThrough();
    stdin.isTTY = true;
    stdin.setRawMode = () => {};
    const stdout = new PassThrough();
    stdout.columns = width;
    stdout.rows = 30;
    stdout.resume();
    const stderr = new PassThrough();
    stderr.resume();
    let output = "";
    stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    t.mock.method(globalThis, "fetch", async (input) =>
      String(input).includes("?blobs=true")
        ? Response.json({
            id: "org/Coder",
            siblings: [
              { rfilename: "coder.Q4_K_M.gguf", size: 1234 },
              { rfilename: "coder.Q8_0.gguf", size: 2345 },
            ],
          })
        : String(input).includes("README.md")
          ? new Response("# Test model card")
          : Response.json([]),
    );
    const searches = [];
    const downloaded = [];
    let closed = false;
    const props = {
      width,
      height: 30,
      downloads: [],
      onSearch: (query) => searches.push(query),
      onDownloadSelected: (...args) => downloaded.push(args),
      onClose: () => {
        closed = true;
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
    const press = async (key) => {
      stdin.write(key);
      await delay(40);
    };
    await delay(40);
    await press("codr");
    await press("\u001b[D");
    await press("e");
    await press("\u0006"); // Ctrl+F must not insert a character into the search.
    await press("\u001b[F");
    await press("\r");
    assert.deepEqual(searches, ["coder"]);
    instance.rerender(
      React.createElement(ModelDownloader, {
        ...props,
        downloads: [
          {
            name: "org/Coder",
            title: "Coder",
            files: [
              {
                quantization: "Q4_K_M",
                fileName: "coder.Q4_K_M.gguf",
                uri: "https://huggingface.co/org/Coder/resolve/main/coder.Q4_K_M.gguf",
              },
            ],
          },
        ],
      }),
    );
    await delay(300);
    assert.match(output, /Coder/);
    await press("\r"); // Results -> files, without downloading.
    assert.equal(downloaded.length, 0);
    await press("\u001b[B"); // Select the next quantization in the middle list.
    await press("\r");
    assert.deepEqual(downloaded, [
      ["https://huggingface.co/org/Coder/resolve/main/coder.Q8_0.gguf", "coder.Q8_0.gguf"],
    ]);
    await press("\u001b[C"); // Files -> details.
    assert.match(output, /org\/Coder/);
    await press("\u001b[C"); // Overview -> model card.
    assert.match(output, /Test model card/);
    await press("\u001b[C"); // Model card -> metadata.
    assert.match(output, /REPOSITORY METADATA/);
    await press("\u001b[6~"); // Page down.
    await press("\u001b"); // Details -> search.
    assert.equal(closed, false);
    await press(" revised");
    await press("\r");
    assert.deepEqual(searches, ["coder", "coder revised"]);
    await press("\u001b"); // Results -> search, without closing.
    assert.equal(closed, false);
    await press("\u001b[B"); // Search -> results.
    await press("\r"); // Results -> quantizations.
    await press("\u001b"); // Quantizations -> search.
    assert.equal(closed, false);
    await press("\u001b");
    assert.equal(closed, true);
  });
}
