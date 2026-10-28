export function createAskQuestionsTool({ requestQuestions }) {
  return {
    description:
      "Ask the user a short questionnaire in an interactive dialog and wait for answers. Cancellation is not consent. Use for clarification, not as implicit authorization for unrelated actions.",
    params: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              question: { type: "string" },
              type: { type: "string", enum: ["text", "single", "multiple"] },
              options: { type: "array", items: { type: "string" } },
              allowCustom: { type: "boolean" },
            },
            required: ["id", "question", "type"],
          },
        },
      },
      required: ["questions"],
    },
    async handler({ questions } = {}, { signal } = {}) {
      if (!Array.isArray(questions) || !questions.length || questions.length > 8)
        return { ok: false, output: "Error: provide 1–8 questions." };
      const ids = new Set();
      for (const q of questions) {
        if (
          !q ||
          typeof q.id !== "string" ||
          !q.id.trim() ||
          q.id.length > 100 ||
          ids.has(q.id) ||
          typeof q.question !== "string" ||
          !q.question.trim() ||
          q.question.length > 1000 ||
          !["text", "single", "multiple"].includes(q.type) ||
          (q.allowCustom !== undefined && typeof q.allowCustom !== "boolean") ||
          (q.type !== "text" &&
            (!Array.isArray(q.options) ||
              !q.options.length ||
              q.options.length > 12 ||
              q.options.some((o) => typeof o !== "string" || !o.trim() || o.length > 200) ||
              new Set(q.options).size !== q.options.length))
        )
          return {
            ok: false,
            output: "Error: invalid question, duplicate ID, or invalid choice options.",
          };
        ids.add(q.id);
      }
      if (!requestQuestions)
        return { ok: false, output: "Error: interactive questions are unavailable." };
      const result = await requestQuestions(questions, { signal });
      return { ok: true, output: JSON.stringify(result) };
    },
  };
}
