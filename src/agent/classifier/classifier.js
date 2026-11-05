import {
  TIER_CLASSIFIER_INSTRUCTIONS,
  buildTierClassificationPrompt,
  parseTierClassification,
} from "./instructions.js";

export function createClassifier({
  getAssignment,
  localAdapterFactory,
  openAIAdapterFactory,
  openRouterAdapterFactory,
  timeoutMs = 30_000,
  maxRetries = 2,
  retryDelayMs = 250,
}) {
  const adapters = new Map();
  let disposed = false;
  let queue = Promise.resolve();
  function enqueue(operation, signal) {
    const result = queue.then(() => {
      if (signal?.aborted) throw signal.reason ?? new Error("Classification cancelled.");
      return operation();
    });
    queue = result.catch(() => {});
    if (!signal) return result;
    return new Promise((resolve, reject) => {
      const abort = () => {
        signal.removeEventListener("abort", abort);
        reject(signal.reason ?? new Error("Classification cancelled."));
      };
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      result.then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    });
  }

  function assignmentKey(assignment) {
    return assignment ? `${assignment.provider}:${assignment.model}` : "";
  }

  function getAdapter(assignment) {
    if (!assignment?.provider || !assignment.model) return null;
    const key = assignmentKey(assignment);
    if (adapters.has(key)) return adapters.get(key);
    let adapter;
    if (assignment.provider === "local") adapter = localAdapterFactory({ model: assignment.model });
    else if (assignment.provider === "openai")
      adapter = openAIAdapterFactory({ model: assignment.model });
    else if (assignment.provider === "openrouter")
      adapter = openRouterAdapterFactory({ model: assignment.model });
    else throw new Error(`Unsupported classifier provider: ${assignment.provider}`);
    adapters.set(key, adapter);
    return adapter;
  }

  async function reconcileAdapters(assignment) {
    const activeKey = assignmentKey(assignment);
    const inactiveAdapters = [...adapters.entries()].filter(([key]) => key !== activeKey);
    await Promise.allSettled(inactiveAdapters.map(([, adapter]) => adapter.dispose?.()));
    for (const [key] of inactiveAdapters) adapters.delete(key);
  }

  return {
    load() {
      return enqueue(async () => {
        if (disposed) throw new Error("Classifier has been disposed.");
        const assignment = getAssignment();
        await reconcileAdapters(assignment);
        const adapter = getAdapter(assignment);
        await adapter?.load?.();
      });
    },
    classify(input) {
      return enqueue(async () => {
        if (disposed) throw new Error("Classifier has been disposed.");
        const assignment = getAssignment();
        await reconcileAdapters(assignment);
        if (!assignment?.model) return null;
        const adapter = getAdapter(assignment);
        for (let attempt = 0; ; attempt++) {
          const controller = new AbortController();
          const relay = () => controller.abort(input.signal.reason);
          input.signal?.addEventListener("abort", relay, { once: true });
          if (input.signal?.aborted) relay();
          const timeout = new Error(`Classification timed out after ${timeoutMs / 1000} seconds.`);
          const timer = setTimeout(() => controller.abort(timeout), timeoutMs);
          let abort;
          try {
            const cancelled = new Promise((_, reject) => {
              abort = () => reject(controller.signal.reason);
              controller.signal.addEventListener("abort", abort, { once: true });
              if (controller.signal.aborted) abort();
            });
            const output = await Promise.race([
              adapter.run({
                instructions: TIER_CLASSIFIER_INSTRUCTIONS,
                input: [{ role: "user", content: buildTierClassificationPrompt(input) }],
                signal: controller.signal,
              }),
              cancelled,
            ]);
            return parseTierClassification(output);
          } catch (error) {
            if (input.signal?.aborted) throw input.signal.reason ?? error;
            if (controller.signal.reason !== timeout || attempt >= maxRetries) throw error;
            input.onRetry?.({ attempt: attempt + 1, maxRetries });
            await new Promise((resolve, reject) => {
              const abortDelay = () => {
                clearTimeout(delay);
                reject(input.signal.reason ?? new Error("Classification cancelled."));
              };
              const delay = setTimeout(() => {
                input.signal?.removeEventListener("abort", abortDelay);
                resolve();
              }, retryDelayMs);
              input.signal?.addEventListener("abort", abortDelay, { once: true });
              if (input.signal?.aborted) abortDelay();
            });
          } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener("abort", abort);
            input.signal?.removeEventListener("abort", relay);
          }
        }
      }, input.signal);
    },
    getInfo() {
      const assignment = getAssignment();
      return assignment
        ? { ...assignment, configured: Boolean(assignment.model) }
        : { configured: false };
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      await queue;
      await Promise.allSettled([...adapters.values()].map((adapter) => adapter.dispose?.()));
      adapters.clear();
    },
  };
}
