export function createQuestionRequest({ notify = () => {} } = {}) {
  let pending;
  return {
    getState: () => pending?.request,
    respond(answers) {
      pending?.finish({ cancelled: answers == null, answers: answers ?? [] });
    },
    request(questions, { signal } = {}) {
      if (pending) throw new Error("A question dialog is already open.");
      if (signal?.aborted) return Promise.resolve({ cancelled: true, answers: [] });
      return new Promise((resolve) => {
        const abort = () => finish({ cancelled: true, answers: [] });
        const finish = (result) => {
          signal?.removeEventListener("abort", abort);
          pending = undefined;
          notify();
          resolve(result);
        };
        pending = { request: { questions }, finish };
        signal?.addEventListener("abort", abort, { once: true });
        notify();
      });
    },
  };
}
