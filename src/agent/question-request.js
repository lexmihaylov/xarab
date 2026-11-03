export function createQuestionRequest({ notify = () => {} } = {}) {
  let pending;
  const queue = [];
  const advance = () => {
    pending = queue.shift();
    notify();
  };
  let nextId = 0;
  return {
    getState: () => pending?.request,
    respond(answers, requestId) {
      if (requestId !== undefined && requestId !== pending?.request.requestId) return;
      pending?.finish({ cancelled: answers == null, answers: answers ?? [] });
    },
    request(questions, { signal, commandApproval } = {}) {
      if (signal?.aborted) return Promise.resolve({ cancelled: true, answers: [] });
      return new Promise((resolve) => {
        let settled = false;
        const abort = () => finish({ cancelled: true, answers: [] });
        const finish = (result) => {
          if (settled) return;
          settled = true;
          signal?.removeEventListener("abort", abort);
          if (pending === entry) advance();
          else {
            const index = queue.indexOf(entry);
            if (index >= 0) queue.splice(index, 1);
          }
          resolve(result);
        };
        const entry = {
          request: {
            requestId: ++nextId,
            questions,
            ...(commandApproval ? { commandApproval } : {}),
          },
          finish,
        };
        queue.push(entry);
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        else if (!pending) advance();
      });
    },
  };
}
