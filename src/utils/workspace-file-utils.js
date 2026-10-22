import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";

export function isWithinDirectory(directory, target) {
  const relative = path.relative(directory, target);
  return (
    relative === "" ||
    (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
  );
}

export async function resolveWorkspaceFile(
  workspace,
  requestedPath,
  { createParents = false } = {},
) {
  const root = await realpath(path.resolve(workspace));
  const candidate = path.resolve(root, requestedPath);
  if (!isWithinDirectory(root, candidate)) throw new Error("File path is outside the workspace.");
  if (candidate === root) throw new Error("Path is not a regular file.");

  const relativeParent = path.relative(root, path.dirname(candidate));
  let parent = root;
  for (const segment of relativeParent ? relativeParent.split(path.sep) : []) {
    const next = path.join(parent, segment);
    if (createParents) {
      try {
        await mkdir(next);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    }
    const realParent = await realpath(next);
    if (!isWithinDirectory(root, realParent))
      throw new Error("File path resolves outside the workspace.");
    if (!(await stat(realParent)).isDirectory())
      throw new Error(`Parent path is not a directory: ${segment}`);
    parent = realParent;
  }

  const target = path.join(parent, path.basename(candidate));
  let metadata;
  try {
    metadata = await lstat(target);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (metadata?.isSymbolicLink()) throw new Error("Symbolic-link files are not supported.");
  if (metadata && !metadata.isFile()) throw new Error("Path is not a regular file.");
  return {
    root,
    target,
    displayPath: path.relative(root, target) || path.basename(target),
    exists: Boolean(metadata),
    mode: metadata?.mode,
  };
}

export async function readWorkspaceText(target, displayPath) {
  const bytes = await readFile(target);
  if (bytes.includes(0)) throw new Error(`Binary files are not supported: ${displayPath}`);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error(`File is not valid UTF-8 text: ${displayPath}`);
  }
}

// Tool output commonly normalizes CRLF to LF. Match that representation while
// retaining the file's original bytes when calculating the replacement range.
export function findText(source, requested) {
  const direct = source.indexOf(requested);
  if (direct !== -1) return { index: direct, length: requested.length };

  const normalizedSource = source.replace(/\r\n/g, "\n");
  const normalizedRequested = requested.replace(/\r\n/g, "\n");
  const normalizedIndex = normalizedSource.indexOf(normalizedRequested);
  if (normalizedIndex === -1) return null;

  let index = 0;
  let sourceIndex = 0;
  while (index < normalizedIndex) {
    sourceIndex +=
      normalizedSource[index] === "\n" && source.slice(sourceIndex, sourceIndex + 2) === "\r\n"
        ? 2
        : 1;
    index += 1;
  }
  let sourceLength = 0;
  for (const character of normalizedRequested) {
    sourceLength +=
      character === "\n" &&
      source.slice(sourceIndex + sourceLength, sourceIndex + sourceLength + 2) === "\r\n"
        ? 2
        : 1;
  }
  return { index: sourceIndex, length: sourceLength };
}

export async function replaceWorkspaceText(target, content, mode) {
  const temporary = path.join(path.dirname(target), `.xarab-${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", mode === undefined ? 0o666 : mode & 0o777);
  try {
    await handle.writeFile(content, "utf8");
    if (mode !== undefined) await handle.chmod(mode & 0o777);
  } catch (error) {
    await handle.close();
    await unlink(temporary).catch(() => {});
    throw error;
  }
  await handle.close();
  try {
    await rename(temporary, target);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
}
