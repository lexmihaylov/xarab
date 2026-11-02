import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { commandActions, parsePolicy, pathAction, strictest } from "../src/agent/command-policy.js";
import { loadApprovedPolicy } from "../src/agent/policy-consent.js";

const policy = (rules = {}) => parsePolicy(JSON.stringify({ version: 1, ...rules }));
const approve = async () => ({
  cancelled: false,
  answers: [{ id: "workspace_policy", choices: ["Approve"] }],
});

async function workspace(t, text = JSON.stringify({ version: 1 })) {
  const root = await mkdtemp(path.join(os.tmpdir(), "xarab-policy-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, ".xarab"));
  await writeFile(path.join(root, ".xarab", "command-policy.json"), text);
  return root;
}

test("transient activation failure retries rather than caching denial", async (t) => {
  const root = await workspace(t);
  let calls = 0;
  const requestQuestions = async () => {
    if (++calls === 1) throw new Error("A question dialog is already open.");
    return approve();
  };
  assert.equal(await loadApprovedPolicy({ workspace: root, requestQuestions }), null);
  assert.ok(await loadApprovedPolicy({ workspace: root, requestQuestions }));
  assert.equal(calls, 2);
});

test("cancelled activation waiter does not wait for or cancel its owner", async (t) => {
  const root = await workspace(t);
  let release;
  let entered;
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const requestQuestions = () => {
    entered();
    return new Promise((resolve) => {
      release = resolve;
    });
  };
  const owner = loadApprovedPolicy({ workspace: root, requestQuestions });
  await started;
  const controller = new AbortController();
  const waiter = loadApprovedPolicy({
    workspace: root,
    requestQuestions,
    signal: controller.signal,
  });
  controller.abort();
  await assert.rejects(waiter, /cancelled/);
  release(await approve());
  assert.ok(await owner);
  assert.ok(await loadApprovedPolicy({ workspace: root, requestQuestions }));
});

test("policy parser supplies defaults and rejects malformed rules", () => {
  assert.deepEqual(policy(), { version: 1, commands: {}, files: {}, folders: {} });
  for (const text of [
    "{",
    "null",
    '{"version":2}',
    '{"version":1,"extra":{}}',
    '{"version":1,"commands":[]}',
    '{"version":1,"files":"bad"}',
    '{"version":1,"commands":{"bad/name":"allow"}}',
    '{"version":1,"files":{"../secret":"deny"}}',
    '{"version":1,"folders":{"/absolute":"deny"}}',
    '{"version":1,"files":{"a/../b":"deny"}}',
    '{"version":1,"files":{"a\\\\b":"deny"}}',
    '{"version":1,"commands":{"echo":"maybe"}}',
  ])
    assert.throws(() => parsePolicy(text), text);
});

test("strictest and path rules enforce precedence and workspace boundaries", () => {
  assert.equal(strictest("allow", ["deny", "verify"]), "deny");
  assert.equal(strictest(undefined, "allow", "verify"), "verify");
  const rules = policy({
    files: { "src/key": "deny", "src/readme": "allow" },
    folders: { src: "verify", "src/public": "allow" },
  });
  assert.equal(pathAction(rules, "/work", "src/key"), "deny");
  assert.equal(pathAction(rules, "/work", "src/readme"), "verify");
  assert.equal(pathAction(rules, "/work", "src/public/file"), "verify");
  assert.equal(pathAction(rules, "/work", "src", true), "deny");
  assert.equal(pathAction(rules, "/work", "../src/key"), undefined);
  assert.equal(pathAction(rules, "/work", "src-other"), undefined);
});

test("grouped commands combine actions and retain unmatched groups for fallback", () => {
  const rules = policy({ commands: { echo: "allow", cat: "verify" }, files: { secret: "deny" } });
  assert.deepEqual(commandActions(rules, "/work", "echo hello && cat secret; unknown arg"), {
    action: "deny",
    unmatched: ["unknown arg"],
  });
  assert.deepEqual(commandActions(rules, "/work", "echo hello | cat file"), {
    action: "verify",
    unmatched: [],
  });
  assert.deepEqual(commandActions(rules, "/work", "echo $(unknown)"), {
    action: "allow",
    unmatched: ["echo $(unknown)"],
  });
  assert.deepEqual(commandActions(rules, "/work", ""), { action: undefined, unmatched: [""] });
  assert.equal(commandActions(rules, "/work", "echo --file=secret").action, "deny");
});

test("policy activation caches a decision per workspace and contents", async (t) => {
  const root = await workspace(t);
  let calls = 0;
  const requestQuestions = async (...args) => {
    calls++;
    return approve(...args);
  };
  assert.deepEqual(await loadApprovedPolicy({ workspace: root, requestQuestions }), policy());
  assert.deepEqual(await loadApprovedPolicy({ workspace: root, requestQuestions }), policy());
  assert.equal(calls, 1);
  await writeFile(
    path.join(root, ".xarab", "command-policy.json"),
    JSON.stringify({ version: 1, commands: { echo: "allow" } }),
  );
  assert.deepEqual(
    await loadApprovedPolicy({ workspace: root, requestQuestions }),
    policy({ commands: { echo: "allow" } }),
  );
  assert.equal(calls, 2);
});

test("missing or malformed policy falls back without requesting consent", async (t) => {
  const root = await workspace(t, "not json");
  const reports = [];
  const requestQuestions = () => assert.fail("must not ask for malformed or missing policy");
  assert.equal(
    await loadApprovedPolicy({
      workspace: root,
      requestQuestions,
      report: (message) => reports.push(message),
    }),
    null,
  );
  assert.match(reports[0], /Malformed workspace policy ignored/);
  await rm(path.join(root, ".xarab", "command-policy.json"));
  assert.equal(
    await loadApprovedPolicy({
      workspace: root,
      requestQuestions,
      report: (message) => reports.push(message),
    }),
    null,
  );
  assert.equal(reports.length, 1);
});

test("denied, cancelled, unavailable, and failing consent fall back safely", async (t) => {
  for (const requestQuestions of [
    async () => ({ cancelled: false, answers: [{ id: "workspace_policy", choices: ["Deny"] }] }),
    async () => ({ cancelled: true }),
    undefined,
    async () => {
      throw new Error("dialog unavailable");
    },
  ]) {
    const root = await workspace(t);
    assert.equal(await loadApprovedPolicy({ workspace: root, requestQuestions }), null);
  }
});

test("concurrent activation shares one consent request", async (t) => {
  const root = await workspace(t);
  let calls = 0;
  let resolve;
  let requested;
  const response = new Promise((done) => {
    resolve = done;
  });
  const started = new Promise((done) => {
    requested = done;
  });
  const requestQuestions = () => {
    calls++;
    requested();
    return response;
  };
  const first = loadApprovedPolicy({ workspace: root, requestQuestions });
  const second = loadApprovedPolicy({ workspace: root, requestQuestions });
  await started;
  resolve(await approve());
  assert.deepEqual(await Promise.all([first, second]), [policy(), policy()]);
  assert.equal(calls, 1);
});
test("cancelled activation falls back and an aborted owner can retry", async (t) => {
  const root = await workspace(t);
  const controller = new AbortController();
  await assert.rejects(
    loadApprovedPolicy({
      workspace: root,
      signal: controller.signal,
      requestQuestions: async () => {
        controller.abort();
        return { cancelled: true };
      },
    }),
    /cancelled/i,
  );
  let calls = 0;
  const result = await loadApprovedPolicy({
    workspace: root,
    requestQuestions: async () => {
      calls++;
      return approve();
    },
  });
  assert.deepEqual(result, policy());
  assert.equal(calls, 1);
});
