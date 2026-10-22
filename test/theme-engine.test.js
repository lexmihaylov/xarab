import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultTheme,
  getDimmedColors,
  getTheme,
  listThemes,
  registerTheme,
} from "../src/utils/theme-engine.js";

test("default theme preserves the existing palette", () => {
  assert.equal(getTheme().name, "default");
  assert.equal(getTheme().colors.accent, "#8fbfdc");
  assert.equal(getTheme().colors.text, "#c5d0dd");
  assert.equal(getTheme().markdown.keyword, "#c792ea");
});

test("themes can be registered and looked up", () => {
  const theme = {
    ...defaultTheme,
    name: "test-theme",
    colors: { ...defaultTheme.colors },
    welcome: { ...defaultTheme.welcome },
    messages: { ...defaultTheme.messages },
    markdown: { ...defaultTheme.markdown },
  };

  registerTheme(theme);
  assert.equal(getTheme("test-theme"), theme);
  assert.ok(listThemes().includes("test-theme"));
});

test("unknown themes fall back to the default", () => {
  assert.equal(getTheme("does-not-exist"), defaultTheme);
});

test("dimmed colors are derived from a theme", () => {
  assert.equal(getDimmedColors().accent, "#2b3942");
  assert.equal(getDimmedColors("default").overlay, "#0a0e11");
});

test("invalid themes are rejected", () => {
  assert.throws(() => registerTheme({ name: "invalid" }), /missing its colors/);
});
