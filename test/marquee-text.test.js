import test from "node:test";
import assert from "node:assert/strict";
import { marqueeFrame } from "../src/components/MarqueeText.component.jsx";

test("marquee frames fit the available columns", () => {
  assert.equal(marqueeFrame("long-model-name", 4, 0), "long");
  assert.equal(marqueeFrame("long-model-name", 4, 5), "mode");
  assert.equal(marqueeFrame("model", 0, 0), "");
});

test("marquee frames preserve wide and combined graphemes", () => {
  assert.equal(marqueeFrame("模型abc", 3, 0), "模");
  assert.equal(marqueeFrame("模型abc", 3, 1), "型a");
  assert.equal(marqueeFrame("e\u0301abc", 2, 0), "e\u0301a");
});
