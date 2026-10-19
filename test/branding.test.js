import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createAssistantController } from "../src/agent/controller.js";
import { acquireInstanceLock } from "../src/instance-lock.js";
import { createWelcomeMessage } from "../src/ui/welcome-message.js";

test("package and lockfile expose the executable xarab command", async () => {
  const metadata = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(metadata.name, "xarab");
  assert.deepEqual(metadata.bin, { xarab: "bin/xarab.js" });
  assert.equal(lock.name, metadata.name);
  assert.equal(lock.packages[""].name, metadata.name);
  assert.deepEqual(lock.packages[""].bin, metadata.bin);
  assert.equal(metadata.scripts.postinstall, "node scripts/install-classifier.js");
  assert.equal(metadata.scripts["model:qwen3"], undefined);
  assert.equal(metadata.scripts["model:qwen2.5-coder"], undefined);
  const executable = new URL("../bin/xarab.js", import.meta.url);
  assert.match(await readFile(executable, "utf8"), /^#!\/usr\/bin\/env node/);
  assert.ok((await stat(executable)).mode & 0o111);
});

test("welcome screen places the image-derived scarab above the plain XARAB name", () => {
  const welcomeMessage = createWelcomeMessage();
  const logo = welcomeMessage.filter((row) => row.type === "welcome-logo").map((row) => row.text);
  assert.equal(logo.length, 10);
  for (const row of logo) {
    assert.equal(row.length, 18);
    assert.match(row, /^[█▀▄ ]+$/);
  }
  assert.ok(
    welcomeMessage
      .filter((row) => row.type === "welcome-logo")
      .every((row) => row.pixels.length > 0),
  );
  const nameIndex = welcomeMessage.findIndex((row) => row.type === "welcome-brand");
  assert.equal(welcomeMessage[nameIndex].text, "XARAB");
  assert.ok(nameIndex > welcomeMessage.findLastIndex((row) => row.type === "welcome-logo"));
});

test("controller defaults are stored under the xarab data directory", async (t) => {
  const root = await mkdtemp("/tmp/opencode/xarab-branding-");
  t.after(() => rm(root, { recursive: true, force: true }));
  t.mock.method(os, "homedir", () => root);
  const modelPath = path.join(root, "models", "coder.gguf");
  const controller = createAssistantController({
    root,
    workspace: root,
    instructionFiles: [],
    downloadFile: async () => modelPath,
  });
  await controller.initialize();
  await controller.submit("/download");
  await controller.downloadSelectedModel("https://example.com/coder.gguf", "coder.gguf");
  const config = JSON.parse(await readFile(path.join(root, ".xarab", "config.json"), "utf8"));
  assert.ok(Object.hasOwn(config.models, modelPath));
  await controller.shutdown();
});

test("default instance lock uses the xarab name", async (t) => {
  const root = await mkdtemp("/tmp/opencode/xarab-branding-lock-");
  t.after(() => rm(root, { recursive: true, force: true }));
  t.mock.method(os, "tmpdir", () => root);
  const release = await acquireInstanceLock();
  assert.equal(typeof release, "function");
  try {
    assert.deepEqual(await readdir(root), ["xarab.lock"]);
  } finally {
    await release();
  }
});
