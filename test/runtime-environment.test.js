import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";

const runtimeUrl = new URL("../src/runtime-environment.js", import.meta.url).href;

function inspectRuntime(environment) {
  const env = { ...process.env };
  if (environment === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = environment;
  const result = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `import ${JSON.stringify(runtimeUrl)};
       import { createRequire } from 'node:module';
       const require = createRequire(${JSON.stringify(import.meta.url)});
       const uiRequire = createRequire(require.resolve('@opentui/react'));
       uiRequire('react-reconciler');
       console.log(JSON.stringify({
         environment: process.env.NODE_ENV,
         production: Object.keys(require.cache).some(path => path.endsWith('/react-reconciler.production.js')),
         development: Object.keys(require.cache).some(path => path.endsWith('/react-reconciler.development.js'))
       }));`,
    ],
    { env, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("normal runs load the production reconciler without development profiling", () => {
  assert.deepEqual(inspectRuntime(undefined), {
    environment: "production",
    production: true,
    development: false,
  });
});

test("explicit development mode remains available", () => {
  assert.deepEqual(inspectRuntime("development"), {
    environment: "development",
    production: false,
    development: true,
  });
});

test("CLI initializes the environment before importing React or OpenTUI", async () => {
  const source = await readFile(new URL("../src/cli.jsx", import.meta.url), "utf8");
  const imports = [...source.matchAll(/^import\s+.*$/gm)].map(([line]) => line);
  assert.equal(imports[0], 'import "./runtime-environment.js";');
});
