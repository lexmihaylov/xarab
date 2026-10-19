import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToString } from "ink";
import { getComposerRows } from "../src/ui/composer-layout.js";
import { Composer } from "../src/ui/components/composer.component.jsx";

test("composer grows for newlines, shrinks for removed content, and caps its height", () => {
  const rows = (value) => getComposerRows({ value, width: 80 });
  assert.equal(rows(""), 1);
  assert.equal(rows("first"), 1);
  assert.equal(rows("first\n"), 2);
  assert.equal(rows("first\nsecond\nthird"), 3);
  assert.equal(rows("line\n".repeat(12)), 6);
  assert.equal(rows("first"), 1);
});

test("composer height accounts for wrapping, cursor space, wide text, and terminal limits", () => {
  assert.equal(getComposerRows({ value: "x".repeat(20), width: 24 }), 2);
  assert.equal(getComposerRows({ value: "x".repeat(20), width: 24, isActive: false }), 1);
  assert.equal(getComposerRows({ value: "中文".repeat(6), width: 24 }), 2);
  assert.equal(getComposerRows({ value: "first\nsecond\nthird", width: 80, maxRows: 2 }), 2);
  assert.equal(getComposerRows({ value: "first\nsecond", width: 80, maxRows: 1 }), 1);
});

test("rendered composer expands its border along with the input", () => {
  const draw = (value) =>
    renderToString(React.createElement(Composer, { value, width: 80 })).split("\n");
  const single = draw("first");
  const multiple = draw("first\nsecond\nthird");
  assert.equal(multiple.length, single.length + 2);
  assert.ok(multiple.some((line) => line.includes("third")));
  assert.equal(draw("").length, single.length);
});
