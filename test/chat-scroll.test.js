import test from "node:test";
import assert from "node:assert/strict";
import { isChatWheelRow, mouseWheelDirection, nextScrollOffset } from "../src/ui/terminal-utils.js";

test("recognizes SGR and legacy terminal mouse-wheel reports", () => {
  assert.deepEqual(mouseWheelDirection("\x1b[<64;12;4M"), { direction: -1, y: 4 });
  assert.deepEqual(mouseWheelDirection("\x1b[<65;12;4M"), { direction: 1, y: 4 });
  assert.deepEqual(mouseWheelDirection(`\x1b[M${String.fromCharCode(96, 44, 36)}`), {
    direction: -1,
    y: 4,
  });
  assert.equal(mouseWheelDirection("ordinary input"), null);
});

test("clamps chat page scrolling at the top and bottom", () => {
  assert.equal(nextScrollOffset(0, -1, 40, 10), 9);
  assert.equal(nextScrollOffset(38, -1, 40, 10), 40);
  assert.equal(nextScrollOffset(10, 1, 40, 10), 1);
  assert.equal(nextScrollOffset(0, 1, 40, 10), 0);
});

test("supports smaller scroll steps", () => {
  assert.equal(nextScrollOffset(10, -1, 40, 10, 3), 13);
  assert.equal(nextScrollOffset(10, 1, 40, 10, 3), 7);
});

test("routes wheel input only to the chat rows", () => {
  assert.equal(isChatWheelRow(0, 17), false);
  assert.equal(isChatWheelRow(1, 17), true);
  assert.equal(isChatWheelRow(2, 17), true);
  assert.equal(isChatWheelRow(17, 17), true);
  assert.equal(isChatWheelRow(18, 17), false);
  assert.equal(isChatWheelRow(19, 17), false);
});
