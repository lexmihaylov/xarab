import test from "node:test";
import assert from "node:assert/strict";
import { createSessionTitleTask } from "../src/agent/session-title-task.js";

function setup() {
  let session = { id: "one", manualTitle: false };
  let finish;
  let request;
  const warnings = [];
  const titles = [];
  const task = createSessionTitleTask({
    runner: {
      run(options) {
        request = options;
        return new Promise((resolve) => {
          finish = resolve;
        });
      },
    },
    getSession: () => session,
    applyTitle: async (target, title) => titles.push([target.id, title]),
    warn: (warning) => warnings.push(warning),
  });
  return {
    task,
    get session() {
      return session;
    },
    setSession: (next) => {
      session = next;
    },
    finish: (result) => finish(result),
    get request() {
      return request;
    },
    warnings,
    titles,
  };
}

test("title task bounds input and applies a validated result without tools", async () => {
  const s = setup();
  const pending = s.task.start("x".repeat(5000), s.session);
  assert.equal(s.request.input.length, 4096);
  assert.equal(s.request.mode, undefined);
  assert.throws(() => s.request.parse("x".repeat(81)), /Invalid/);
  s.finish({ status: "completed", value: "New title" });
  await pending;
  assert.deepEqual(s.titles, [["one", "New title"]]);
});

test("rename, switching, deletion, and cancellation discard stale title results", async () => {
  for (const change of [
    (s) => {
      s.session.manualTitle = true;
    },
    (s) => s.setSession({ id: "two" }),
    (s) => s.setSession(null),
    (s) => s.task.cancel(),
  ]) {
    const s = setup();
    const pending = s.task.start("First message", s.session);
    change(s);
    s.finish({ status: "completed", value: "Stale title" });
    await pending;
    assert.deepEqual(s.titles, []);
    assert.deepEqual(s.warnings, []);
  }
});

test("title failure warns without replacing fallback", async () => {
  const s = setup();
  const pending = s.task.start("Task", s.session);
  s.finish({ status: "failed", error: "No model" });
  await pending;
  assert.deepEqual(s.titles, []);
  assert.match(s.warnings[0], /No model/);
});

test("title retries only timeouts, then applies the result", async () => {
  const s = setup();
  const pending = s.task.start("Task", s.session);
  s.finish({ status: "timed-out", error: "timeout" });
  await new Promise((resolve) => setImmediate(resolve));
  s.finish({ status: "completed", value: "Recovered" });
  await pending;
  assert.deepEqual(s.titles, [["one", "Recovered"]]);
  assert.deepEqual(s.warnings, []);
});

test("title timeout retries are bounded", async () => {
  let calls = 0;
  const warnings = [];
  const session = {};
  const task = createSessionTitleTask({
    runner: {
      run: async () => {
        calls++;
        return { status: "timed-out", error: "timeout" };
      },
    },
    getSession: () => session,
    applyTitle: () => assert.fail("unexpected title"),
    warn: (message) => warnings.push(message),
  });
  await task.start("Task", session);
  assert.equal(calls, 3);
  assert.match(warnings[0], /timeout/);
});

test("cancelling a timed-out title prevents another attempt", async () => {
  const s = setup();
  const pending = s.task.start("Task", s.session);
  s.task.cancel();
  s.finish({ status: "timed-out", error: "timeout" });
  await pending;
  assert.deepEqual(s.warnings, []);
  assert.deepEqual(s.titles, []);
});
