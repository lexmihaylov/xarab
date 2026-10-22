import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, readdir, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

const ID = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const MAX_BYTES = 32 * 1024 * 1024;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string";

export function validateSession(value, expectedId = value?.id) {
  if (!object(value) || value.version !== 1) throw new Error("Unsupported session format");
  if (!ID.test(value.id) || value.id !== expectedId) throw new Error("Invalid session ID");
  if (
    !text(value.title) ||
    !value.title.trim() ||
    value.title.length > 80 ||
    /[\u0000-\u001f\u007f]/.test(value.title) ||
    !text(value.workspace) ||
    !path.isAbsolute(value.workspace)
  )
    throw new Error("Invalid session metadata");
  if (
    ![value.createdAt, value.updatedAt].every(
      (date) => text(date) && Number.isFinite(Date.parse(date)),
    )
  )
    throw new Error("Invalid session timestamps");
  if (
    value.modelPath !== undefined &&
    value.modelPath !== null &&
    (!text(value.modelPath) || !path.isAbsolute(value.modelPath))
  )
    throw new Error("Invalid saved model path");
  if (
    value.contextSize !== undefined &&
    value.contextSize !== null &&
    (!Number.isInteger(value.contextSize) || value.contextSize < 1)
  )
    throw new Error("Invalid context size");
  if (
    !Array.isArray(value.messages) ||
    value.messages.some(
      (message) =>
        !object(message) ||
        !["user", "agent", "system", "shell", "intent"].includes(message.type) ||
        !text(message.message) ||
        (message.severity !== undefined &&
          !["info", "warning", "error"].includes(message.severity)) ||
        (message.parts !== undefined &&
          (!Array.isArray(message.parts) ||
            message.parts.some(
              (part) =>
                !object(part) ||
                !["text", "tool"].includes(part.type) ||
                (part.type === "text" && !text(part.text)) ||
                (part.type === "tool" &&
                  (!text(part.title ?? part.label) ||
                    !["running", "complete", "error"].includes(part.status))) ||
                (part.callId !== undefined && (!text(part.callId) || !part.callId)) ||
                (part.summary !== undefined && !text(part.summary)) ||
                (part.diffText !== undefined && !text(part.diffText)) ||
                (part.result !== undefined &&
                  (!object(part.result) ||
                    typeof part.result.ok !== "boolean" ||
                    !text(part.result.output) ||
                    (part.result.truncated !== undefined &&
                      typeof part.result.truncated !== "boolean") ||
                    (part.result.errorCode !== undefined && !text(part.result.errorCode)))),
            ))),
    )
  )
    throw new Error("Invalid saved messages");
  if (
    !Array.isArray(value.history) ||
    value.history.some(
      (item) =>
        !object(item) ||
        !["system", "user", "model"].includes(item.type) ||
        (item.type === "user" && !text(item.text)) ||
        (item.type === "system" && !text(item.text) && !Array.isArray(item.text)) ||
        (item.type === "model" &&
          (!Array.isArray(item.response) ||
            item.response.some(
              (part) =>
                !text(part) &&
                (!object(part) ||
                  !["functionCall", "segment"].includes(part.type) ||
                  (part.type === "functionCall" && !text(part.name)) ||
                  (part.type === "segment" && !text(part.text))),
            ))),
    )
  )
    throw new Error("Invalid saved model history");
  if (
    !object(value.draft) ||
    !text(value.draft.value) ||
    !Number.isInteger(value.draft.cursor) ||
    value.draft.cursor < 0 ||
    value.draft.cursor > value.draft.value.length
  )
    throw new Error("Invalid saved draft");
  if (
    !Array.isArray(value.pendingShellContext) ||
    value.pendingShellContext.some((entry) => !object(entry))
  )
    throw new Error("Invalid pending shell context");
  if (typeof value.interrupted !== "boolean" || typeof value.manualTitle !== "boolean")
    throw new Error("Invalid session state");
  if (
    value.turn !== null &&
    (!object(value.turn) ||
      !text(value.turn.prompt) ||
      !Number.isInteger(value.turn.userIndex) ||
      value.turn.userIndex < 0 ||
      value.turn.userIndex >= value.messages.length)
  )
    throw new Error("Invalid interrupted turn");
  return value;
}

export function newSession(workspace, title) {
  if (title !== undefined)
    title = title
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .trim()
      .slice(0, 80);
  const now = new Date().toISOString();
  return {
    version: 1,
    id: randomUUID(),
    title: title || "New session",
    manualTitle: Boolean(title),
    workspace: path.resolve(workspace),
    createdAt: now,
    updatedAt: now,
    messages: [],
    history: [],
    draft: { value: "", cursor: 0 },
    pendingShellContext: [],
    interrupted: false,
    turn: null,
  };
}

export function createSessionStore(directory) {
  let queue = Promise.resolve();
  const file = (id) => {
    if (!ID.test(id)) throw new Error("Invalid session ID");
    return path.join(directory, `${id}.json`);
  };
  async function load(id) {
    const filename = file(id);
    if ((await stat(filename)).size > MAX_BYTES) throw new Error("Session file is too large");
    return validateSession(JSON.parse(await readFile(filename, "utf8")), id);
  }
  return {
    directory,
    load,
    save(record) {
      const snapshot = JSON.parse(JSON.stringify(record));
      validateSession(snapshot);
      const data = `${JSON.stringify(snapshot)}\n`;
      if (Buffer.byteLength(data) > MAX_BYTES)
        return Promise.reject(new Error("Session is too large to save"));
      const operation = queue
        .catch(() => {})
        .then(async () => {
          await mkdir(directory, { recursive: true, mode: 0o700 });
          const temporary = path.join(directory, `.${snapshot.id}.${randomUUID()}.tmp`);
          let handle;
          try {
            handle = await open(temporary, "wx", 0o600);
            await handle.writeFile(data);
            await handle.sync();
            await handle.close();
            handle = undefined;
            await rename(temporary, file(snapshot.id));
          } finally {
            await handle?.close();
            await unlink(temporary).catch((error) => {
              if (error.code !== "ENOENT") throw error;
            });
          }
          return snapshot;
        });
      queue = operation;
      return operation;
    },
    async remove(id) {
      const filename = file(id);
      const operation = queue
        .catch(() => {})
        .then(async () => {
          try {
            await unlink(filename);
          } catch (error) {
            if (error.code !== "ENOENT") throw error;
          }
          return true;
        });
      queue = operation;
      return operation;
    },
    async list(workspace) {
      await queue.catch(() => {});
      let files;
      try {
        files = await readdir(directory);
      } catch (error) {
        if (error.code === "ENOENT") return { sessions: [], errors: [] };
        throw error;
      }
      const sessions = [],
        errors = [];
      for (const filename of files) {
        const id = filename.replace(/\.json$/, "");
        if (!filename.endsWith(".json") || !ID.test(id)) continue;
        try {
          const record = await load(id);
          if (record.workspace !== path.resolve(workspace)) continue;
          sessions.push({
            id,
            title: record.title,
            workspace: record.workspace,
            updatedAt: record.updatedAt,
            createdAt: record.createdAt,
            messageCount: record.messages.filter((message) => message.type === "user").length,
            interrupted: record.interrupted,
            preview: record.messages.slice(-6).map((message) => ({
              type: message.type,
              message: message.message.slice(0, 2000),
              severity: message.severity,
            })),
          });
        } catch (error) {
          errors.push(`${id}: ${error.message}`);
        }
      }
      sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      return { sessions, errors };
    },
    flush: () => queue,
  };
}
