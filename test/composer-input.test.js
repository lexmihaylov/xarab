import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import React from "react";
import { render, useInput } from "ink";
import { Composer } from "../src/ui/components/composer.component.jsx";
import { useComposer } from "../src/ui/hooks/use-composer.js";

function ComposerHarness(props) {
  // A modal keeps the terminal input stream active while the composer is disabled.
  useInput(() => {}, { isActive: !props.isActive });
  const composer = useComposer(props);
  return React.createElement(Composer, {
    ...composer,
    width: 40,
    isActive: props.isActive,
    disabled: props.isGenerating,
    maxRows: props.maxRows,
  });
}

async function setup(t, overrides = {}) {
  const stdin = new PassThrough();
  stdin.isTTY = true;
  stdin.setRawMode = () => {};
  const stdout = new PassThrough();
  stdout.columns = 40;
  stdout.rows = 24;
  stdout.resume();
  let output = "";
  stdout.on("data", (chunk) => {
    output = chunk.toString();
  });
  const stderr = new PassThrough();
  stderr.resume();
  const submissions = [],
    scrolls = [];
  let escapes = 0,
    interrupts = 0;
  const props = {
    isActive: true,
    onSubmit: (value) => submissions.push(value),
    onScroll: (offset) => scrolls.push(offset),
    onEscape: () => {
      escapes++;
    },
    onInterrupt: () => {
      interrupts++;
    },
    ...overrides,
  };
  const instance = render(React.createElement(ComposerHarness, props), {
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
  await delay(40);
  return {
    get output() {
      return output;
    },
    submissions,
    scrolls,
    get escapes() {
      return escapes;
    },
    get interrupts() {
      return interrupts;
    },
    async press(key) {
      stdin.write(key);
      await delay(30);
    },
    async active(isActive) {
      instance.rerender(React.createElement(ComposerHarness, { ...props, isActive }));
      await delay(30);
    },
  };
}

test("packaged composer keeps insertion, navigation, forward delete, backspace and submit", async (t) => {
  const ui = await setup(t);
  await ui.press("alpha");
  await ui.press("\u001b[D");
  await ui.press("\u001b[D");
  await ui.press("X");
  await ui.press("\u001b[3~");
  await ui.press("\u001b[H");
  await ui.press("[");
  await ui.press("\u001b[F");
  await ui.press("]z");
  await ui.press("\u007f");
  await ui.press("\r");
  assert.deepEqual(ui.submissions, ["[alpXa]"]);
});

test("packaged composer preserves multiline shortcuts, pasted text and vertical cursor movement", async (t) => {
  const ui = await setup(t);
  await ui.press("first");
  await ui.press("\u000e"); // Ctrl+N.
  await ui.press("second");
  await ui.press("\u001b[13;2u"); // Shift+Enter via the Kitty protocol.
  await ui.press("third");
  await ui.press("\u001b[A"); // Up to the second line at column 5.
  await ui.press("!");
  await ui.press("\u001b[F");
  await ui.press("\nlast");
  await ui.press("\r");
  assert.deepEqual(ui.submissions, ["first\nsecon!d\nthird\nlast"]);
});

test("packaged composer keeps slash suggestions and application shortcuts", async (t) => {
  const ui = await setup(t);
  await ui.press("/");
  await ui.press("\u001b[B");
  await ui.press("\t");
  await ui.press("\r");
  assert.deepEqual(ui.submissions, ["/route"]);
  await ui.press("\u001b[5~");
  await ui.press("\u001b[6~");
  await ui.press("\u0003");
  await ui.press("\u001b");
  assert.deepEqual(ui.scrolls, [-1, 1]);
  assert.equal(ui.interrupts, 1);
  assert.equal(ui.escapes, 1);
});

test("packaged composer cannot consume input while a modal owns focus", async (t) => {
  const ui = await setup(t);
  await ui.press("keep");
  await ui.active(false);
  await ui.press("ignored");
  await ui.press("\r");
  assert.deepEqual(ui.submissions, []);
  await ui.active(true);
  await ui.press("\r");
  assert.deepEqual(ui.submissions, ["keep"]);
});

test("packaged composer scrolls the editing viewport to keep the cursor visible", async (t) => {
  const ui = await setup(t, { maxRows: 2 });
  await ui.press("one\ntwo\nthree\nfour");
  assert.match(ui.output, /three/);
  assert.match(ui.output, /four/);
  assert.doesNotMatch(ui.output, /\bone\b|\btwo\b/);
  await ui.press("\u001b[A");
  await ui.press("\u001b[A");
  assert.match(ui.output, /two/);
  assert.doesNotMatch(ui.output, /four/);
});

test("input navigation and deletion do not split emoji or combining characters", async (t) => {
  const ui = await setup(t);
  await ui.press("A👩‍💻e\u0301B");
  await ui.press("\u001b[D");
  await ui.press("\u007f");
  await ui.press("\u001b[D");
  await ui.press("\u001b[3~");
  await ui.press("\u001b[F");
  await ui.press("Z");
  await ui.press("\r");
  assert.deepEqual(ui.submissions, ["ABZ"]);
});

test("chat input expands as lines are added and shrinks after sending", async (t) => {
  const ui = await setup(t);
  const borderHeight = () => {
    const lines = ui.output.split("\n");
    return (
      lines.findIndex((line) => line.startsWith("╰")) -
      lines.findIndex((line) => line.startsWith("╭")) +
      1
    );
  };
  assert.equal(borderHeight(), 3);
  await ui.press("first");
  await ui.press("\u000e");
  await ui.press("second");
  await ui.press("\u000e");
  await ui.press("third");
  assert.equal(borderHeight(), 5);
  await ui.press("\r");
  assert.equal(borderHeight(), 3);
  assert.deepEqual(ui.submissions, ["first\nsecond\nthird"]);
});
