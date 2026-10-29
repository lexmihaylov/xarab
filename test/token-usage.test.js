import test from "node:test";
import assert from "node:assert/strict";
import { addTokenUsage, formatTokenUsage } from "../src/agent/token-usage.js";

test("sums completion usage and preserves cache/reasoning subsets", () => {
  const usage = {
    input_tokens: 16,
    output_tokens: 5,
    total_tokens: 21,
    input_tokens_details: { cached_tokens: 8 },
    output_tokens_details: { reasoning_tokens: 2 },
  };
  const first = addTokenUsage(undefined, usage);
  const total = addTokenUsage(first, usage);
  assert.deepEqual(total, {
    input_tokens: 32,
    output_tokens: 10,
    total_tokens: 42,
    cached_tokens: 16,
    reasoning_tokens: 4,
  });
  assert.equal(first.total_tokens, 21);
  assert.equal(formatTokenUsage(total), "32 in / 10 out / 42 total · 16 cached · 4 reasoning");
});

test("missing or malformed usage is not interpreted as zero", () => {
  assert.equal(addTokenUsage(undefined, undefined), undefined);
  const current = { input_tokens: 1, output_tokens: 2, total_tokens: 3 };
  assert.equal(
    formatTokenUsage(current),
    "1 in / 2 out / 3 total · unavailable cached · unavailable reasoning",
  );
  for (const usage of [null, {}, { input_tokens: -1, output_tokens: 2, total_tokens: 1 }])
    assert.equal(addTokenUsage(current, usage), current);
  const withDetails = { ...current, cached_tokens: 1, reasoning_tokens: 1 };
  assert.equal(addTokenUsage(withDetails, current).cached_tokens, undefined);
  assert.equal(addTokenUsage(current, { ...current, cached_tokens: 1 }).cached_tokens, undefined);
});
