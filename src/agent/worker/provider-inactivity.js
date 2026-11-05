export async function withProviderInactivity({
  signal,
  timeoutMs = 60_000,
  maxRetries = 2,
  provider,
  onRetry = () => {},
  operation,
}) {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const relay = () => controller.abort(signal.reason ?? new Error("Request cancelled."));
    signal?.addEventListener("abort", relay, { once: true });
    if (signal?.aborted) relay();
    let timer;
    let outputStarted = false;
    const timeout = new Error(`${provider} response stalled for ${timeoutMs / 1000} seconds.`);
    const activity = ({ output = false } = {}) => {
      if (controller.signal.aborted) return;
      outputStarted ||= output;
      clearTimeout(timer);
      timer = setTimeout(() => controller.abort(timeout), timeoutMs);
    };
    let abort;
    const cancelled = new Promise((_, reject) => {
      abort = () => reject(controller.signal.reason);
      controller.signal.addEventListener("abort", abort, { once: true });
      if (controller.signal.aborted) abort();
    });
    try {
      activity();
      return await Promise.race([
        Promise.resolve().then(() => {
          if (controller.signal.aborted) throw controller.signal.reason;
          return operation({ signal: controller.signal, activity, attempt });
        }),
        cancelled,
      ]);
    } catch (error) {
      if (signal?.aborted) throw signal.reason ?? error;
      if (controller.signal.reason !== timeout) throw error;
      if (outputStarted) {
        throw new Error(
          `${timeout.message} Response stopped after partial output; review any displayed text and continue or retry manually.`,
        );
      }
      if (attempt >= maxRetries) throw timeout;
      await onRetry({ attempt: attempt + 1, maxRetries });
    } finally {
      clearTimeout(timer);
      controller.signal.removeEventListener("abort", abort);
      signal?.removeEventListener("abort", relay);
    }
  }
}
