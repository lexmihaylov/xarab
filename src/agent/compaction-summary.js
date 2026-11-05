export async function generateCompactionSummary({
  worker,
  request,
  signal,
  onRetry,
  maxRetries = 2,
}) {
  for (let attempt = 0; ; attempt++) {
    if (signal.aborted) throw signal.reason ?? new Error("Compaction cancelled.");
    const chunks = [];
    let sawDelta = false;
    let active = true;
    try {
      await worker.complete({
        ...request,
        signal,
        onText(chunk) {
          if (active && !signal.aborted && !sawDelta) chunks.push(chunk);
        },
        onTextDelta(chunk) {
          if (!active || signal.aborted) return;
          sawDelta = true;
          chunks.push(chunk);
        },
      });
      if (signal.aborted) throw signal.reason ?? new Error("Compaction cancelled.");
      const summary = chunks.join("").trim();
      if (!summary) throw new Error("The compaction model returned an empty summary.");
      return summary;
    } catch (error) {
      if (signal.aborted || error?.code !== "PROVIDER_INACTIVITY_TIMEOUT" || attempt >= maxRetries)
        throw error;
      onRetry?.({ attempt: attempt + 1, maxRetries });
    } finally {
      active = false;
    }
  }
}
