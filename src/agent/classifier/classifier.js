import {
  TIER_CLASSIFIER_INSTRUCTIONS,
  buildTierClassificationPrompt,
  parseTierClassification,
} from "./instructions.js";

export function createClassifier({ getAssignment, localAdapterFactory, openAIAdapterFactory }) {
  const adapters = new Map();
  let disposed = false;

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
    else throw new Error(`Unsupported classifier provider: ${assignment.provider}`);
    adapters.set(key, adapter);
    return adapter;
  }

  return {
    async load() {
      if (disposed) throw new Error("Classifier has been disposed.");
      const adapter = getAdapter(getAssignment());
      await adapter?.load?.();
    },
    async classify(input) {
      if (disposed) throw new Error("Classifier has been disposed.");
      const assignment = getAssignment();
      if (!assignment?.model) return null;
      const adapter = getAdapter(assignment);
      const output = await adapter.run({
        instructions: TIER_CLASSIFIER_INSTRUCTIONS,
        input: [
          {
            role: "user",
            content: buildTierClassificationPrompt(input),
          },
        ],
        signal: input.signal,
      });
      return parseTierClassification(output);
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
      await Promise.allSettled([...adapters.values()].map((adapter) => adapter.dispose?.()));
      adapters.clear();
    },
  };
}
