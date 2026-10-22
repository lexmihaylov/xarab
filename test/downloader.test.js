import React, { act } from "react";
import { test } from "node:test";
import assert from "node:assert/strict";
import { testRender } from "@opentui/react/test-utils";
import { ModelDownloader } from "../src/components/ModelDownloader.component.jsx";

const downloads = Array.from({ length: 20 }, (_, index) => ({
  name: `publisher/model-${index + 1}`,
  title: `Model ${index + 1}`,
  files: Array.from({ length: 30 }, (_, file) => ({
    fileName: `q${file + 1}.gguf`,
    uri: `test:${index}/${file}`,
    size: 2_000_000_000,
  })),
}));

test("downloader keeps headers and table columns separate and scrolls selected models", async (t) => {
  // Keep metadata pending: this test exercises local layout, not Hugging Face.
  t.mock.method(
    globalThis,
    "fetch",
    (_url, options) =>
      new Promise((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("aborted")), {
          once: true,
        });
      }),
  );
  const selectedDownloads = [];
  const view = await testRender(
    React.createElement(ModelDownloader, {
      downloads,
      onClose() {},
      onSearch() {},
      onDownloadSelected(...args) {
        selectedDownloads.push(args);
      },
    }),
    { width: 140, height: 30 },
  );
  try {
    await view.flush();
    const frame = view.captureCharFrame();
    assert.match(frame, /Model:.*1\/20.*Quantization:.*1\/30/);
    assert.match(frame, /File name.*File size/);
    assert.match(frame, /q1.gguf.*2.0 GB/);
    await act(async () => view.mockInput.pressTab());
    await view.flush();
    for (let i = 0; i < 19; i++) {
      await act(async () => view.mockInput.pressArrow("down"));
      await view.flush();
    }
    assert.match(view.captureCharFrame(), /Model:.*20\/20/);
    assert.match(view.captureCharFrame(), /Model 20/);
    await act(async () => view.mockInput.pressArrow("right"));
    for (let i = 0; i < 29; i++) {
      await act(async () => view.mockInput.pressArrow("down"));
      await view.flush();
    }
    assert.match(view.captureCharFrame(), /Quantization:.*30\/30/);
    assert.match(view.captureCharFrame(), /q30.gguf.*2.0 GB/);
    await act(async () => view.mockInput.pressEnter());
    assert.deepEqual(selectedDownloads, [["test:19/29", "q30.gguf"]]);
    await act(async () => view.resize(70, 24));
    await view.flush();
    assert.match(view.captureCharFrame(), /Quantization:.*30\/30/);
    assert.doesNotMatch(view.captureCharFrame(), /Model:/);
    await act(async () => view.mockInput.pressArrow("left"));
    await view.flush();
    assert.match(view.captureCharFrame(), /Model:.*20\/20/);
    assert.doesNotMatch(view.captureCharFrame(), /Quantization:/);
  } finally {
    await view.dispose();
  }
});
