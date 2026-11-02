// One local worker adapter per application. Concurrent work fails explicitly
// rather than loading duplicate models or deadlocking a parent awaiting a child.
export function createLocalWorkerRuntime(factory) {
  let adapter;
  let busy = false;
  let closed = false;
  let work;
  let disposal;
  const waiters = new Set();
  function idle(signal) {
    return new Promise((resolve, reject) => {
      const finish = () => {
        signal?.removeEventListener("abort", abort);
        waiters.delete(finish);
        resolve();
      };
      const abort = () => {
        signal?.removeEventListener("abort", abort);
        waiters.delete(finish);
        reject(signal.reason ?? new Error("Local task cancelled."));
      };
      waiters.add(finish);
      signal?.addEventListener("abort", abort, { once: true });
      if (signal?.aborted) abort();
    });
  }
  return {
    createAdapter({ wait = false } = {}) {
      return {
        async run(request) {
          while (busy && wait && !closed) await idle(request.signal);
          if (closed) throw new Error("Local worker runtime is closed.");
          if (request.signal?.aborted)
            throw request.signal.reason ?? new Error("Local task cancelled.");
          if (busy)
            throw new Error("Local worker is busy; retry after the active local run finishes.");
          busy = true;
          try {
            adapter ??= factory();
            work = Promise.resolve(adapter.run(request));
            return await work;
          } finally {
            work = undefined;
            busy = false;
            for (const finish of [...waiters]) finish();
          }
        },
        // Individual workers do not own the shared runtime.
        async dispose() {},
      };
    },
    dispose() {
      if (disposal) return disposal;
      closed = true;
      for (const finish of [...waiters]) finish();
      disposal = (async () => {
        await work?.catch(() => {});
        await adapter?.dispose?.();
      })();
      return disposal;
    },
  };
}
