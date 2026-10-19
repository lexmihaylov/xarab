import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import test from "node:test";
import { copyToClipboard } from "../src/agent/clipboard.js";

test("copies to the Windows clipboard from WSL", async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough();
  let received = "";
  child.stdin.on("data", (chunk) => (received += chunk.toString()));
  let invocation;

  const result = await copyToClipboard("https://auth.openai.com/login", {
    platform: "linux",
    env: { WSL_DISTRO_NAME: "Ubuntu" },
    spawnImpl: (...args) => {
      invocation = args;
      queueMicrotask(() => child.emit("close", 0));
      return child;
    },
  });

  assert.equal(result, true);
  assert.equal(received, "https://auth.openai.com/login");
  assert.equal(invocation[0], "clip.exe");
});

test("returns false when no clipboard program can be started", async () => {
  const result = await copyToClipboard("url", {
    platform: "linux",
    env: {},
    spawnImpl: () => {
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      queueMicrotask(() => child.emit("error", new Error("not installed")));
      return child;
    },
  });

  assert.equal(result, false);
});
