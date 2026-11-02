export function createQuestionRequest({ notify = () => {} } = {}) {
  let pending;
  let nextId = 0;
  return {
    getState: () => pending?.request,
    respond(answers, requestId) {
      if (requestId !== undefined && requestId !== pending?.request.requestId) return;
      pending?.finish({ cancelled: answers == null, answers: answers ?? [] });
    },
    request(questions, { signal, commandApproval } = {}) {
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
        pending = {
          request: {
            requestId: ++nextId,
            questions,
            ...(commandApproval ? { commandApproval } : {}),
          },
          finish,
        };
        signal?.addEventListener("abort", abort, { once: true });
        notify();
      });
    },
  };
}
