import { createOpenRouterWorkerAdapter } from "../worker/openrouter-worker-adapter.js";

export function createOpenRouterClassifierAdapter({ model, getApiKey, fetchImpl = fetch }) {
  const worker = createOpenRouterWorkerAdapter({ getApiKey, fetchImpl });
  return {
    async run({ instructions, input, signal }) {
      let text = "";
      await worker.run({
        model,
        instructions,
        input,
        signal,
        onText: (chunk) => {
          text += chunk;
        },
      });
      return text;
    },
  };
}
