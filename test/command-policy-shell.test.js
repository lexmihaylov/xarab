import test from "node:test";
import assert from "node:assert/strict";
import { commandActions, parsePolicy } from "../src/agent/command-policy.js";

const policy = parsePolicy(
  JSON.stringify({
    version: 1,
    commands: { echo: "allow", cat: "allow" },
    files: { "secrets/key": "deny", "a;b|c": "deny" },
  }),
);
const assess = (command) => commandActions(policy, "/work", command);

test("quoted separators stay in their argument and quoted fragments concatenate", () => {
  for (const command of ['cat "a;b|c"', "cat 'a;b|c'", "cat a\";b\"'|c'"]) {
    assert.deepEqual(assess(command), { action: "deny", unmatched: [] });
  }
  assert.deepEqual(assess('echo "x && unknown | y"'), { action: "allow", unmatched: [] });
  assert.deepEqual(assess("echo '*.js $HOME ; |'"), { action: "allow", unmatched: [] });
});

test("expansions, comments, and unsupported shell syntax cannot bypass assessment", () => {
  for (const command of [
    "echo *",
    "echo ?.js",
    "echo [ab]",
    "echo $HOME",
    'echo "$HOME"',
    "echo $(cat secrets/key)",
    "echo `id`",
    "echo ${HOME}",
    "echo ~",
    "echo ok # comment",
    "echo ok # comment\nunknown",
    "(echo ok)",
    "{ echo ok; }",
    "if echo ok; then echo yes; fi",
    "echo 'unfinished",
    "echo foo\\ bar",
    "echo ok & unknown",
    "echo ok\nunknown",
    "echo *.js && echo ok",
  ])
    assert.deepEqual(assess(command).unmatched, [command], command);
  assert.deepEqual(assess("echo foo#bar").unmatched, []);
});

test("simple input and output redirection targets retain deny rules", () => {
  for (const command of [
    "cat <secrets/key",
    "cat < secrets/key",
    "echo >secrets/key",
    "echo >> secrets/key",
    'echo 2>"secrets/key"',
    "<secrets/key cat",
    "echo ok > secrets/key && echo done",
  ])
    assert.deepEqual(assess(command), { action: "deny", unmatched: [command] }, command);
});

test("simple groups preserve action aggregation and unmatched group strings", () => {
  assert.deepEqual(assess("echo ok && unknown 'a;b' | cat file; missing arg"), {
    action: "allow",
    unmatched: ["unknown 'a;b'", "missing arg"],
  });
  assert.deepEqual(assess(""), { action: undefined, unmatched: [""] });
  assert.deepEqual(assess("echo " + "x".repeat(65536)).unmatched.length, 1);
  assert.deepEqual(assess("echo " + "x ".repeat(4097)).unmatched.length, 1);
});
