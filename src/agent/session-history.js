export function restoreMessages(messages) {
  return JSON.parse(JSON.stringify(messages)).map((message) => ({
    ...message,
    ...(message.parts
      ? {
          parts: message.parts.map((part) =>
            part.type === "tool" && part.status === "running"
              ? {
                  ...part,
                  status: "error",
                  title: `Interrupted: ${part.title ?? part.label}`,
                  summary:
                    "This operation was interrupted. It has not been replayed; verify its effects before retrying.",
                }
              : part,
          ),
        }
      : {}),
  }));
}
