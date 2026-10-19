import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createAssistantController } from "../src/agent/controller.js";

async function setup(t, downloadFile, onStateChange) {
  const root = await mkdtemp("/tmp/opencode/xarab-download-controller-");
  const configPath = path.join(root, "config.json");
  const controller = createAssistantController({
    root,
    modelsDir: path.join(root, "models"),
    configPath,
    workspace: root,
    instructionFiles: [],
    downloadFile,
    onStateChange,
  });
  t.after(async () => {
    await controller.shutdown();
    await rm(root, { recursive: true, force: true });
  });
  await controller.initialize();
  await controller.submit("/download coder");
  return { controller, root, configPath };
}

test("cancellation keeps progress open until cleanup settles and never registers the model", async (t) => {
  let options;
  let reject;
  const { controller, root } = await setup(t, async (_uri, opts) => {
    options = opts;
    opts.onProgress({ totalSize: 100, downloadedSize: 25 });
    return new Promise((_resolve, no) => {
      reject = no;
    });
  });
  const transfer = controller.downloadSelectedModel("https://example.com/coder.gguf", "coder.gguf");
  await Promise.resolve();
  assert.equal(controller.getState().modelModal.progress, 0.25);
  const canceled = controller.cancelModelDownload();
  assert.equal(options.signal.aborted, true);
  assert.equal(controller.getState().modelModal.canceling, true);
  assert.ok(controller.getState().modelModal.downloading);
  controller.downloadSelectedModel("https://example.com/other.gguf", "other.gguf");
  assert.equal(controller.getState().modelModal.downloadFileName, "coder.gguf");
  options.onProgress({ totalSize: 100, downloadedSize: 99 });
  assert.equal(controller.getState().modelModal.progress, 0.25);
  reject(options.signal.reason);
  await Promise.all([transfer, canceled]);
  assert.equal(controller.getState().modelModal.downloading, null);
  assert.equal(controller.getState().modelModal.canceling, false);
  assert.equal(controller.getState().modelModal.error, null);
  assert.match(controller.getState().modelModal.downloadNotice, /Partial files removed/);
  assert.ok(!controller.getState().messages.some((item) => /Model downloaded/.test(item.message)));
  assert.deepEqual(await readdir(root), []);
  await controller.shutdown();
});

test("completed downloads close progress and persist the model configuration", async (t) => {
  const { controller, configPath, root } = await setup(t, async (_uri, opts) => {
    opts.onProgress({ totalSize: 100, downloadedSize: 100 });
    return path.join(opts.directory, "coder.gguf");
  });
  await controller.downloadSelectedModel("https://example.com/coder.gguf", "coder.gguf");
  assert.equal(controller.getState().modelModal.downloading, null);
  assert.equal(controller.getState().modelModal.progress, 1);
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.ok(Object.hasOwn(config.models, path.join(root, "models", "coder.gguf")));
  await controller.shutdown();
});

test("cleanup failures are displayed as errors rather than claiming a successful cancellation", async (t) => {
  const { controller } = await setup(t, async () => {
    throw new Error("Could not remove partial files");
  });
  await controller.downloadSelectedModel("https://example.com/coder.gguf", "coder.gguf");
  assert.match(controller.getState().modelModal.error, /Could not remove partial files/);
  assert.equal(controller.getState().modelModal.downloadNotice, null);
  await controller.shutdown();
});

test("closing the browser and shutdown cancel rather than abandon the transfer", async (t) => {
  let options, reject;
  const { controller } = await setup(t, async (_uri, opts) => {
    options = opts;
    return new Promise((_resolve, no) => {
      reject = no;
    });
  });
  const transfer = controller.downloadSelectedModel("https://example.com/coder.gguf", "coder.gguf");
  await Promise.resolve();
  controller.closeModelModal();
  assert.ok(controller.getState().modelModal);
  assert.equal(options.signal.aborted, true);
  const shutdown = controller.shutdown();
  reject(options.signal.reason);
  await Promise.all([transfer, shutdown]);
});

test("progress coalesces rapid events into at most one notification every second", async (t) => {
  let options, reject;
  const states = [];
  const { controller } = await setup(
    t,
    async (_uri, opts) => {
      options = opts;
      return new Promise((_resolve, no) => {
        reject = no;
      });
    },
    (state) => states.push(state),
  );
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const transfer = controller.downloadSelectedModel("https://example.com/coder.gguf", "coder.gguf");
  await Promise.resolve();
  states.length = 0;
  options.onProgress({ totalSize: 100, downloadedSize: 1 });
  assert.equal(states.length, 1);
  for (let bytes = 2; bytes <= 40; bytes++)
    options.onProgress({ totalSize: 100, downloadedSize: bytes });
  t.mock.timers.tick(999);
  assert.equal(states.length, 1);
  assert.equal(controller.getState().modelModal.downloadedSize, 1);
  t.mock.timers.tick(1);
  assert.equal(states.length, 2);
  assert.equal(controller.getState().modelModal.downloadedSize, 40);
  options.onProgress({ totalSize: 100, downloadedSize: 70 });
  t.mock.timers.tick(1000);
  assert.equal(states.length, 3);
  assert.equal(controller.getState().modelModal.downloadedSize, 70);
  options.onProgress({ totalSize: 100, downloadedSize: 90 });
  const canceled = controller.cancelModelDownload();
  assert.equal(controller.getState().modelModal.canceling, true, "Cancel is never throttled");
  const before = states.length;
  t.mock.timers.tick(5000);
  assert.equal(states.length, before, "Pending progress cannot update a canceled download");
  reject(options.signal.reason);
  await Promise.all([transfer, canceled]);
  assert.equal(controller.getState().modelModal.downloading, null);
});

test("completion does not wait for the next progress tick and late callbacks are ignored", async (t) => {
  let options, finish;
  const { controller } = await setup(t, async (_uri, opts) => {
    options = opts;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const transfer = controller.downloadSelectedModel("https://example.com/coder.gguf", "coder.gguf");
  await Promise.resolve();
  options.onProgress({ totalSize: 100, downloadedSize: 1 });
  options.onProgress({ totalSize: 100, downloadedSize: 100 });
  finish("/models/coder.gguf");
  await transfer;
  assert.equal(Date.now(), 0, "Completion should not need a timer tick");
  assert.equal(controller.getState().modelModal.progress, 1);
  assert.equal(controller.getState().modelModal.downloadedSize, 100);
  options.onProgress({ totalSize: 100, downloadedSize: 50 });
  t.mock.timers.tick(1000);
  assert.equal(controller.getState().modelModal.progress, 1);
});
