import { link, mkdir, mkdtemp, readdir, rm, unlink } from "node:fs/promises";
import path from "node:path";
import { createModelDownloader } from "node-llama-cpp";

export async function downloadModelFile(
  uri,
  { directory, fileName, signal, onProgress, createDownloader = createModelDownloader },
) {
  signal?.throwIfAborted();
  await mkdir(directory, { recursive: true });
  const staging = await mkdtemp(path.join(directory, ".download-"));
  let downloader;
  let cancellation;
  let cancelError;
  const installed = [];
  let complete = false;
  const cancel = () => {
    if (!downloader || cancellation) return;
    // Await the downloader's close operation before deleting its working files.
    cancellation = Promise.resolve()
      .then(() => downloader.cancel({ deleteTempFile: true }))
      .catch((error) => {
        cancelError = error;
      });
  };
  signal?.addEventListener("abort", cancel);
  try {
    signal?.throwIfAborted();
    downloader = await createDownloader({
      modelUri: uri,
      dirPath: staging,
      fileName: fileName ? path.basename(fileName) : undefined,
      showCliProgress: false,
      deleteTempFileOnCancel: true,
      onProgress: (progress) => {
        if (!signal?.aborted) onProgress?.(progress);
      },
    });
    if (signal?.aborted) {
      cancel();
      signal.throwIfAborted();
    }
    const entrypoint = await downloader.download();
    signal?.throwIfAborted();
    const name = path.basename(entrypoint);
    if (path.resolve(entrypoint) !== path.join(path.resolve(staging), name))
      throw new Error("Downloaded model is outside its staging directory");
    const files = (await readdir(staging, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.toLowerCase().endsWith(".gguf"))
      .map((file) => file.name);
    if (!files.includes(name)) throw new Error("The download did not produce a GGUF model");
    for (const file of files) {
      signal?.throwIfAborted();
      const destination = path.join(directory, file);
      // Never overwrite an existing model. Hard links also make publication atomic per file.
      await link(path.join(staging, file), destination);
      installed.push(destination);
    }
    signal?.throwIfAborted();
    complete = true;
    return path.join(directory, name);
  } catch (error) {
    if (signal?.aborted) throw signal.reason;
    throw error;
  } finally {
    signal?.removeEventListener("abort", cancel);
    if (!complete) cancel();
    await cancellation;
    const cleanupErrors = cancelError ? [cancelError] : [];
    if (!complete) {
      const removals = await Promise.allSettled(installed.map((file) => unlink(file)));
      for (const removal of removals)
        if (removal.status === "rejected") cleanupErrors.push(removal.reason);
    }
    // This directory belongs exclusively to this download, including any completed shards.
    try {
      await rm(staging, { recursive: true, force: true });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length)
      throw new AggregateError(
        cleanupErrors,
        `Could not finish download cleanup: ${cleanupErrors.map((error) => error.message).join("; ")}`,
      );
  }
}
