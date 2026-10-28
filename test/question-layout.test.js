import assert from "node:assert/strict";
import test from "node:test";
import { questionLayout } from "../src/utils/question-layout.js";
for (const count of [2, 5, 20]) {
  test(`choice pane reserves borders, label, and page indicator for ${count} choices`, () => {
    const options = Array.from({ length: count }, (_, i) => `Choice ${i}`);
    const layout = questionLayout(
      { width: 80, height: 30 },
      "Choose an answer",
      options,
      false,
      count - 1,
    );
    assert.equal(layout.tooSmall, false);
    assert.equal(layout.choicePaneHeight, layout.visible.length + 4);
    assert.ok(layout.visible.includes(count - 1));
    assert.ok(layout.height <= 26);
  });
}

test("short questions remain bounded and compact", () => {
  const result = questionLayout({ width: 120, height: 40 }, "Pick one", ["Red", "Blue"], false, 0);
  assert.equal(result.tooSmall, false);
  assert.ok(result.width < 120);
  assert.ok(result.height < 36);
});
test("long lists paginate without a scroll region", () => {
  const options = Array.from({ length: 40 }, (_, i) => `Choice ${i}`);
  const result = questionLayout({ width: 80, height: 24 }, "Pick", options, false, 39);
  assert.equal(result.tooSmall, false);
  assert.ok(result.pages.length > 1);
  assert.ok(result.visible.includes(39));
  assert.ok(result.height <= 20);
});
test("multiline editor fits a normal terminal", () => {
  assert.equal(
    questionLayout({ width: 80, height: 24 }, "Your answer?", [], true, 0).tooSmall,
    false,
  );
});
test("unfit questions request more terminal space instead of clipping", () => {
  assert.equal(
    questionLayout({ width: 40, height: 12 }, "Question", ["Answer"], false, 0).tooSmall,
    true,
  );
  assert.equal(
    questionLayout({ width: 80, height: 24 }, "Long question ".repeat(300), [], true, 0).tooSmall,
    true,
  );
});
