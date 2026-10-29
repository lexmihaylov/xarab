const fields = ["input_tokens", "output_tokens", "total_tokens"];

export function addTokenUsage(current, usage) {
  if (!usage || !fields.every((key) => Number.isSafeInteger(usage[key]) && usage[key] >= 0))
    return current;
  const next = { ...current };
  for (const key of fields) next[key] = (current?.[key] ?? 0) + usage[key];
  for (const [key, value] of Object.entries({
    cached_tokens: usage.input_tokens_details?.cached_tokens ?? usage.cached_tokens,
    reasoning_tokens: usage.output_tokens_details?.reasoning_tokens ?? usage.reasoning_tokens,
  })) {
    if (
      Number.isSafeInteger(value) &&
      value >= 0 &&
      (!current || Number.isSafeInteger(current[key]))
    )
      next[key] = (current?.[key] ?? 0) + value;
    else delete next[key];
  }
  return next;
}

export function formatTokenUsage(usage) {
  if (!usage) return "";
  const detail = (value) =>
    Number.isSafeInteger(value) ? value.toLocaleString("en-US") : "unavailable";
  return `${usage.input_tokens.toLocaleString("en-US")} in / ${usage.output_tokens.toLocaleString("en-US")} out / ${usage.total_tokens.toLocaleString("en-US")} total · ${detail(usage.cached_tokens)} cached · ${detail(usage.reasoning_tokens)} reasoning`;
}
