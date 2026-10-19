import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:http";
import test from "node:test";
import { downloadModelFile } from "../src/agent/download-model.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
async function directory(t) {
  const dir = await mkdtemp("/tmp/opencode/xarab-download-test-");
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

test("completed split models are published together and staging artifacts are removed", async (t) => {
  const dir = await directory(t);
  const result = await downloadModelFile("https://example.com/model.gguf", {
    directory: dir,
    fileName: "nested/model.gguf",
    createDownloader: async (options) => {
      assert.equal(options.fileName, "model.gguf");
      assert.equal(options.deleteTempFileOnCancel, true);
      return {
        async download() {
          await writeFile(path.join(options.dirPath, "model-00001-of-00002.gguf"), "first");
          await writeFile(path.join(options.dirPath, "model-00002-of-00002.gguf"), "second");
          await writeFile(path.join(options.dirPath, "download.metadata"), "temporary");
          return path.join(options.dirPath, "model-00001-of-00002.gguf");
        },
        async cancel() {
          assert.fail("Completed downloads should not be canceled");
        },
      };
    },
  });
  assert.equal(result, path.join(dir, "model-00001-of-00002.gguf"));
  assert.deepEqual((await readdir(dir)).sort(), [
    "model-00001-of-00002.gguf",
    "model-00002-of-00002.gguf",
  ]);
});

test("cancel waits for the downloader to close, then deletes partial files and completed shards", async (t) => {
  const dir = await directory(t);
  await writeFile(path.join(dir, "existing.gguf"), "keep");
  const controller = new AbortController();
  const started = deferred();
  const closeStarted = deferred();
  const allowClose = deferred();
  const transfer = deferred();
  let staging;
  const result = downloadModelFile("https://example.com/model.gguf", {
    directory: dir,
    signal: controller.signal,
    createDownloader: async ({ dirPath }) => {
      staging = dirPath;
      return {
        async download() {
          await writeFile(path.join(staging, "model-00001-of-00002.gguf"), "complete shard");
          await writeFile(path.join(staging, "model-00002-of-00002.gguf.ipull"), "partial");
          started.resolve();
          return transfer.promise;
        },
        async cancel({ deleteTempFile }) {
          assert.equal(deleteTempFile, true);
          closeStarted.resolve();
          await allowClose.promise;
          transfer.reject(new Error("Transfer stopped"));
        },
      };
    },
  });
  const rejection = assert.rejects(result, (error) => error === controller.signal.reason);
  await started.promise;
  controller.abort();
  await closeStarted.promise;
  assert.equal((await readdir(staging)).length, 2, "Cleanup must wait for the writer to close");
  allowClose.resolve();
  await rejection;
  assert.deepEqual(await readdir(dir), ["existing.gguf"]);
  assert.equal(await readFile(path.join(dir, "existing.gguf"), "utf8"), "keep");
});

test("cancel during downloader initialization never starts the transfer", async (t) => {
  const dir = await directory(t);
  const controller = new AbortController();
  let closed = false;
  await assert.rejects(
    downloadModelFile("https://example.com/model.gguf", {
      directory: dir,
      signal: controller.signal,
      createDownloader: async () => {
        controller.abort();
        return {
          download() {
            assert.fail("Transfer must not start");
          },
          async cancel() {
            closed = true;
          },
        };
      },
    }),
    (error) => error === controller.signal.reason,
  );
  assert.equal(closed, true);
  assert.deepEqual(await readdir(dir), []);
});

test("failed downloads also remove their temporary files", async (t) => {
  const dir = await directory(t);
  await assert.rejects(
    downloadModelFile("https://example.com/model.gguf", {
      directory: dir,
      createDownloader: async ({ dirPath }) => ({
        async download() {
          await writeFile(path.join(dirPath, "partial.gguf"), "partial");
          throw new Error("Network failed");
        },
        async cancel() {},
      }),
    }),
    /Network failed/,
  );
  assert.deepEqual(await readdir(dir), []);
});

test("already canceled downloads never create staging files or contact the server", async (t) => {
  const dir = await directory(t);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    downloadModelFile("https://example.com/model.gguf", {
      directory: dir,
      signal: controller.signal,
      createDownloader() {
        assert.fail("The downloader must not be created");
      },
    }),
    (error) => error === controller.signal.reason,
  );
  assert.deepEqual(await readdir(dir), []);
});

test("cancellation close failures surface cleanup errors and still remove staging files", async (t) => {
  const dir = await directory(t);
  const controller = new AbortController();
  await assert.rejects(
    downloadModelFile("https://example.com/model.gguf", {
      directory: dir,
      signal: controller.signal,
      createDownloader: async ({ dirPath }) => ({
        async download() {
          await writeFile(path.join(dirPath, "partial.gguf"), "partial");
          controller.abort();
          throw controller.signal.reason;
        },
        async cancel() {
          throw new Error("Writer could not close");
        },
      }),
    }),
    /Could not finish download cleanup: Writer could not close/,
  );
  assert.deepEqual(await readdir(dir), []);
});

test("publishing never overwrites existing models and rolls back only its own files", async (t) => {
  const dir = await directory(t);
  await writeFile(path.join(dir, "z-existing.gguf"), "keep");
  await assert.rejects(
    downloadModelFile("https://example.com/model.gguf", {
      directory: dir,
      createDownloader: async ({ dirPath }) => ({
        async download() {
          await writeFile(path.join(dirPath, "a-new.gguf"), "new");
          await writeFile(path.join(dirPath, "z-existing.gguf"), "do not overwrite");
          return path.join(dirPath, "a-new.gguf");
        },
        async cancel() {},
      }),
    }),
    /EEXIST/,
  );
  assert.deepEqual(await readdir(dir), ["z-existing.gguf"]);
  assert.equal(await readFile(path.join(dir, "z-existing.gguf"), "utf8"), "keep");
});

test(
  "the real downloader cancels an HTTP transfer and removes all staging files",
  { timeout: 15000 },
  async (t) => {
    const dir = await directory(t);
    const size = 1024 * 1024;
    const server = createServer((request, response) => {
      const range = request.headers.range?.match(/bytes=(\d+)-(\d*)/);
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
      response.statusCode = range ? 206 : 200;
      response.setHeader("Content-Length", end - start + 1);
      response.setHeader("Accept-Ranges", "bytes");
      if (range) response.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
      if (request.method === "HEAD") return response.end();
      let remaining = end - start + 1;
      const timer = setInterval(() => {
        const count = Math.min(16384, remaining);
        response.write(Buffer.alloc(count));
        remaining -= count;
        if (!remaining) {
          clearInterval(timer);
          response.end();
        }
      }, 20);
      response.on("close", () => clearInterval(timer));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    t.after(() => {
      server.closeAllConnections();
      return new Promise((resolve) => server.close(resolve));
    });
    const controller = new AbortController();
    await assert.rejects(
      downloadModelFile(`http://127.0.0.1:${server.address().port}/model.gguf`, {
        directory: dir,
        fileName: "model.gguf",
        signal: controller.signal,
        onProgress: ({ downloadedSize }) => {
          if (downloadedSize > 0) controller.abort();
        },
      }),
      (error) => error === controller.signal.reason,
    );
    assert.deepEqual(await readdir(dir), []);
  },
);
