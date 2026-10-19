import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { stripVTControlCharacters } from "node:util";
import test from "node:test";
import React from "react";
import { render, renderToString } from "ink";
import { SessionBrowser } from "../src/ui/components/session-browser.component.jsx";
import { App } from "../src/ui/app.component.jsx";
import { StatusBar } from "../src/ui/components/status-bar.component.jsx";

const records = [
  {
    id: "alpha",
    title: "Alpha task",
    workspace: "/project",
    modelPath: "/models/coder.gguf",
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-02T10:00:00Z",
    messageCount: 2,
    preview: [
      { type: "user", message: "Alpha request" },
      { type: "agent", message: "Alpha response" },
    ],
  },
  {
    id: "beta",
    title: "Beta task",
    workspace: "/project",
    modelPath: null,
    createdAt: "2026-01-01T10:00:00Z",
    updatedAt: "2026-01-03T10:00:00Z",
    messageCount: 1,
    preview: [{ type: "user", message: "Beta request" }],
  },
];

test("session persistence errors remain visible instead of being truncated behind model details", () => {
  const output = renderToString(
    React.createElement(StatusBar, {
      width: 60,
      modelPath: "/models/very-long-model-name.gguf",
      sessionTitle: "A long session title",
      status: "Ready",
      sessionError: "Session could not be saved: disk is full",
    }),
  );
  assert.match(output, /Session could not be saved: disk is full/);
  assert.doesNotMatch(output, /very-long-model/);
});

test("session browser renders its list, saved metadata and conversation preview", () => {
  const output = renderToString(
    React.createElement(SessionBrowser, {
      sessions: records,
      currentId: "alpha",
      width: 100,
      height: 28,
    }),
  );
  assert.match(output, /SAVED SESSIONS/);
  assert.match(output, /Alpha task/);
  assert.match(output, /Beta task/);
  assert.doesNotMatch(output, /coder\.gguf/);
  assert.match(output, /RECENT CONVERSATION/);
  assert.match(output, /Alpha request/);
  assert.equal(output.split("\n").length, 28);
  const narrow = renderToString(
    React.createElement(SessionBrowser, { sessions: records, width: 50, height: 24 }),
  );
  assert.match(narrow, /Beta task/);
  assert.equal(narrow.split("\n").length, 24);
});

test("session browser searches, restores drafts, closes without losing drafts, and starts fresh sessions", async (t) => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  stdout.columns = 100;
  stdout.rows = 28;
  stdout.resume();
  const stderr = new PassThrough();
  stderr.resume();
  let output = "";
  stdout.on("data", (chunk) => {
    output = stripVTControlCharacters(chunk.toString());
  });
  let state = {
    messages: [],
    modelPath: "No model selected",
    model: null,
    status: "Ready",
    generating: false,
    currentSession: { id: "alpha", title: "Alpha task" },
    sessionDraft: { value: "first draft", cursor: 11 },
  };
  const submissions = [],
    drafts = [],
    selections = [];
  let instance;
  const refresh = () => instance.rerender(view());
  const handlers = {
    onSubmit: (value) => submissions.push(value),
    onEscape() {},
    onInterrupt() {},
    onDraftChange: (draft) => drafts.push({ id: state.currentSession.id, ...draft }),
    onOpenSessions() {
      state = { ...state, sessionModal: { sessions: records } };
      refresh();
    },
    onCloseSessions() {
      state = { ...state, sessionModal: null };
      refresh();
    },
    onRestoreSession(id) {
      selections.push(id);
      state = {
        ...state,
        sessionModal: null,
        currentSession: { id, title: "Beta task" },
        sessionDraft: { value: "Second draft", cursor: 12 },
        messages: [{ type: "user", message: "Restored transcript" }],
      };
      refresh();
    },
    onNewSession() {
      state = {
        ...state,
        sessionModal: null,
        currentSession: { id: "new", title: "New session" },
        sessionDraft: { value: "", cursor: 0 },
        messages: [],
      };
      refresh();
    },
  };
  const view = () => React.createElement(App, { state, ...handlers });
  instance = render(view(), {
    stdin,
    stdout,
    stderr,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  t.after(() => {
    instance.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });
  const press = async (key) => {
    stdin.write(key);
    await delay(60);
  };
  await delay(80);
  assert.match(output, /first draft/);
  await press("\u000f"); // Ctrl+O opens the browser without submitting the draft.
  assert.match(output, /SAVED SESSIONS/);
  await press("\u001b");
  assert.match(output, /first draft/);
  await press("\u000f");
  await press("Beta");
  assert.match(output, /Beta task/);
  assert.doesNotMatch(output, /Alpha task/);
  await press("\r");
  assert.deepEqual(selections, ["beta"]);
  assert.match(output, /Second draft/);
  assert.ok(
    drafts.filter((draft) => draft.id === "beta").every((draft) => draft.value !== "first draft"),
  );
  await press("\r");
  assert.deepEqual(submissions, ["Second draft"]);
  await press("\u000f");
  await press("\u000e"); // Ctrl+N starts a new session from the browser.
  assert.equal(state.currentSession.id, "new");
  assert.doesNotMatch(output, /Restored transcript|Second draft/);
});

test("Ctrl+D opens a delete confirmation while plain d keeps filtering the search", async (t) => {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  stdout.columns = 100;
  stdout.rows = 28;
  stdout.resume();
  const stderr = new PassThrough();
  stderr.resume();
  let output = "";
  stdout.on("data", (chunk) => {
    output = stripVTControlCharacters(chunk.toString());
  });
  let state = {
    messages: [],
    modelPath: "No model selected",
    model: null,
    status: "Ready",
    generating: false,
    currentSession: { id: "alpha", title: "Alpha task" },
    sessionDraft: { value: "", cursor: 0 },
  };
  const deleted = [];
  let instance;
  const refresh = () => instance.rerender(view());
  const view = () =>
    React.createElement(App, {
      state,
      onSubmit() {},
      onEscape() {},
      onInterrupt() {},
      onDraftChange() {},
      onOpenSessions() {
        state = { ...state, sessionModal: { sessions: records } };
        refresh();
      },
      onCloseSessions() {
        state = { ...state, sessionModal: null };
        refresh();
      },
      onRestoreSession() {},
      onNewSession() {},
      onDeleteSession(id) {
        deleted.push(id);
        state = {
          ...state,
          currentSession:
            id === state.currentSession.id
              ? { id: "fresh", title: "New session" }
              : state.currentSession,
          sessionModal: {
            ...state.sessionModal,
            sessions: state.sessionModal.sessions.filter((record) => record.id !== id),
          },
        };
        refresh();
      },
    });
  instance = render(view(), {
    stdin,
    stdout,
    stderr,
    debug: true,
    patchConsole: false,
    exitOnCtrlC: false,
  });
  t.after(() => {
    instance.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });
  const press = async (key) => {
    stdin.write(key);
    await delay(60);
  };
  await delay(80);
  await press("\u000f");
  assert.match(output, /SAVED SESSIONS/);

  await press("d");
  assert.doesNotMatch(output, /DELETE SESSION/, "plain d must stay in the search filter");
  await press("z");
  assert.match(output, /No saved sessions/, "typed text still filters the session list");
  await press("\u007f");
  await press("\u007f");
  assert.doesNotMatch(output, /No saved sessions/);
  assert.match(output, /Alpha task/);
  assert.match(output, /Beta task/);

  await press("\u0004"); // Ctrl+D
  assert.match(output, /DELETE SESSION/);
  assert.match(output, /Alpha task/);
  assert.match(output, /active session/);

  await press("\u001b");
  assert.doesNotMatch(output, /DELETE SESSION/);
  assert.deepEqual(deleted, []);
  assert.match(output, /Beta task/);

  await press("\u0004");
  assert.match(output, /DELETE SESSION/);
  await press("\r");
  assert.deepEqual(deleted, ["alpha"]);
  assert.doesNotMatch(output, /DELETE SESSION/);
  assert.doesNotMatch(output, /Alpha task/);
  assert.match(output, /Beta task/);
  assert.equal(state.currentSession.id, "fresh");
});
