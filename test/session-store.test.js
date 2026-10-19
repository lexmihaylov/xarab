import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createSessionStore, newSession } from "../src/agent/session-store.js";
import { restoreMessages } from "../src/agent/session-history.js";

async function setup(t) {
  const root = await mkdtemp("/tmp/opencode/xarab-sessions-");
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, store: createSessionStore(path.join(root, "sessions")) };
}

test("sessions round-trip model history, tool results, drafts and pending shell context privately", async (t) => {
  const { root, store } = await setup(t);
  const record = newSession(root, "Feature work");
  record.modelPath = path.join(root, "model.gguf");
  record.contextSize = 32768;
  record.messages = [
    { type: "user", message: "Inspect a file" },
    {
      type: "agent",
      message: "Done",
      parts: [
        { type: "tool", title: "Read file", status: "complete", params: { path: "file.js" } },
      ],
    },
  ];
  record.history = [
    { type: "user", text: "Inspect a file" },
    {
      type: "model",
      response: [
        {
          type: "functionCall",
          name: "read_file",
          params: { path: "file.js" },
          result: "File contents",
          rawCall: ["read_file"],
        },
        "Done",
      ],
    },
  ];
  record.draft = { value: "Next step", cursor: 4 };
  record.pendingShellContext = [{ command: "git status", stdout: "clean" }];
  await store.save(record);
  assert.deepEqual(await store.load(record.id), record);
  assert.equal((await stat(path.join(store.directory, `${record.id}.json`))).mode & 0o777, 0o600);
  assert.equal((await stat(store.directory)).mode & 0o777, 0o700);
  assert.deepEqual(await readdir(store.directory), [`${record.id}.json`]);
});

test("queued saves snapshot immediately and the latest completed save wins atomically", async (t) => {
  const { root, store } = await setup(t);
  const record = newSession(root);
  record.draft = { value: "first", cursor: 5 };
  const first = store.save(record);
  record.draft = { value: "second", cursor: 6 };
  const second = store.save(record);
  assert.equal((await first).draft.value, "first");
  await second;
  await store.flush();
  assert.equal((await store.load(record.id)).draft.value, "second");
  assert.deepEqual(await readdir(store.directory), [`${record.id}.json`]);
});

test("removal deletes atomically queued sessions, tolerates missing files, and rejects bad IDs", async (t) => {
  const { root, store } = await setup(t);
  const record = newSession(root, "Remove me");
  const pending = store.save(record);
  const removal = store.remove(record.id);
  await pending;
  await removal;
  await store.flush();
  await assert.rejects(store.load(record.id), /ENOENT/);
  assert.deepEqual(await readdir(store.directory), []);
  assert.equal(await store.remove(record.id), true, "removing a missing session is a no-op");
  await assert.rejects(store.remove("../../config"), /Invalid session ID/);
});

test("listing filters by workspace and skips corrupt or unsupported files without deleting them", async (t) => {
  const { root, store } = await setup(t);
  const record = newSession(root, "This project");
  await store.save(record);
  await store.save(newSession(path.join(root, "other"), "Other project"));
  const broken = path.join(store.directory, `${randomUUID()}.json`);
  await writeFile(broken, "not json");
  await writeFile(
    path.join(store.directory, `${randomUUID()}.json`),
    JSON.stringify({ version: 999 }),
  );
  const listing = await store.list(root);
  assert.deepEqual(
    listing.sessions.map((entry) => entry.id),
    [record.id],
  );
  assert.equal(listing.errors.length, 2);
  assert.equal(await readFile(broken, "utf8"), "not json");
});

test("session IDs cannot escape storage and malformed snapshots cannot replace a good save", async (t) => {
  const { root, store } = await setup(t);
  const record = newSession(root);
  await store.save(record);
  await assert.rejects(store.load("../../config"), /Invalid session ID/);
  await assert.rejects(
    async () => store.save({ ...record, draft: { value: "bad", cursor: 100 } }),
    /Invalid saved draft/,
  );
  await assert.rejects(
    async () =>
      store.save({ ...record, messages: [{ type: "system", message: "bad", severity: {} }] }),
    /Invalid saved messages/,
  );
  assert.deepEqual(await store.load(record.id), record);
});

test("storage failures are reported without leaving temporary files", async (t) => {
  const { root } = await setup(t);
  const directory = path.join(root, "blocked");
  await writeFile(directory, "keep");
  const store = createSessionStore(directory);
  await assert.rejects(store.save(newSession(root)), /EEXIST/);
  assert.equal(await readFile(directory, "utf8"), "keep");
});

test("interrupted turns restore tool cards without replaying unfinished calls", () => {
  const record = newSession("/workspace");
  record.messages = [
    { type: "user", message: "Work" },
    {
      type: "agent",
      message: "Partly done",
      parts: [{ type: "tool", title: "Write file", status: "running" }],
    },
  ];
  record.turn = { prompt: "Work with attached shell output", userIndex: 0 };
  record.interrupted = true;
  const restored = restoreMessages(record.messages);
  assert.equal(restored[1].parts[0].status, "error");
  assert.match(restored[1].parts[0].summary, /not been replayed/);
  assert.equal(
    record.messages[1].parts[0].status,
    "running",
    "Restoration must not mutate saved data",
  );
});
