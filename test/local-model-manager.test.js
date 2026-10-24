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
