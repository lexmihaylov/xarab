import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createModelManager } from "../src/agent/local-model-manager.js";

test("local model discovery returns provider, path ID, and configured display name", async (t) => {
  const modelsDir = await mkdtemp(path.join(os.tmpdir(), "xarab-models-"));
  t.after(() => rm(modelsDir, { recursive: true, force: true }));
  const id = path.join(modelsDir, "router.gguf");
  await writeFile(id, "test");
  await writeFile(path.join(modelsDir, "other.txt"), "test");
  const manager = createModelManager({
    modelsDir,
    configStore: { getModel: () => ({ name: "Router" }) },
  });
  assert.deepEqual(await manager.listModels(), [{ provider: "local", id, name: "Router" }]);
});

test("deleting a local model retains provider models discovered during deletion", async (t) => {
  const modelsDir = await mkdtemp(path.join(os.tmpdir(), "xarab-models-"));
  t.after(() => rm(modelsDir, { recursive: true, force: true }));
  const deleted = path.join(modelsDir, "deleted.gguf");
  const remaining = path.join(modelsDir, "remaining.gguf");
  await Promise.all([writeFile(deleted, "test"), writeFile(remaining, "test")]);
  const remote = { provider: "openai", id: "remote", name: "Remote" };
  let modal = { mode: "chooser", models: [{ provider: "local", id: deleted }] };
  const manager = createModelManager({
    modelsDir,
    configStore: {
      getModel: () => undefined,
      getClassifier: () => null,
      removeModel: async () => {
        modal = { ...modal, models: [...modal.models, remote], loadingProviderModels: false };
      },
    },
    getModelModal: () => modal,
    setModelModal: (next) => {
      modal = next;
    },
    notify: () => {},
  });

  await manager.deleteModel(deleted);
  assert.deepEqual(modal.models, [
    { provider: "local", id: remaining, name: "remaining.gguf" },
    remote,
  ]);
  assert.equal(modal.loadingProviderModels, false);
});
