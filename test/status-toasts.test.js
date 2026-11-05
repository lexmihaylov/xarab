import assert from "node:assert/strict";
import test from "node:test";
import { replaceStatusToast, statusToast } from "../src/utils/status-toasts.js";

test("routine statuses are suppressed", () => {
  for (const status of ["Ready", "Worker generating…", "Classifying…", ""]) {
    assert.equal(statusToast(status), null);
  }
});

test("progress persists until a transition and confirmations are timed", () => {
  let toasts = replaceStatusToast([], "Compacting conversation…", 1);
  assert.equal(toasts[0].duration, 0);
  toasts = replaceStatusToast(toasts, "Stopping…", 2);
  assert.deepEqual(
    toasts.map((toast) => toast.message),
    ["Stopping…"],
  );
  toasts = replaceStatusToast(toasts, "Session restored", 3);
  assert.equal(toasts[0].severity, "success");
  assert.equal(toasts[0].duration, undefined);
  toasts = replaceStatusToast(toasts, "Ready", 4);
  assert.equal(toasts[0].message, "Session restored");
  toasts = replaceStatusToast(toasts, "Session restored", 5);
  assert.deepEqual(
    toasts.map((toast) => toast.id),
    [3, 5],
  );
});
