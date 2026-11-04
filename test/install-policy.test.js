import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";

test("package installation does not run the removed classifier installer", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  for (const hook of ["preinstall", "install", "postinstall"])
    assert.equal(pkg.scripts[hook], undefined);
  assert.equal(lock.packages[""].hasInstallScript, undefined);
  await assert.rejects(access(new URL("../scripts/install-classifier.js", import.meta.url)), {
    code: "ENOENT",
  });
});
