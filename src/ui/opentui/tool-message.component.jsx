import React from "react";
import { browserColors as colors } from "../model-browser-theme.js";

const statusStyle = {
  running: { color: colors.warning, prefix: "…" },
  complete: { color: colors.green, prefix: "" },
  error: { color: colors.error, prefix: "✕" },
};

export function OpenTuiToolMessage({ part, syntaxStyle }) {
  const status = statusStyle[part.status] ?? statusStyle.complete;
  const title = String(part.title ?? part.label ?? "Tool");
  const rawSummary = part.summary == null ? "" : String(part.summary);
  const summary =
    part.toolName === "run_command"
      ? rawSummary
          .replace(/^Exit code: .*\n?\n?/m, "")
          .replace(/^Signal: .*\n?\n?/m, "")
          .replace(/^Command timed out\.\n?\n?/m, "")
          .replace(/^Execution error: .*\n?\n?/m, "")
          .replace(/^Captured output was truncated at 64 KiB\.\n?\n?/m, "")
          .replace(/^stdout:\n\n?/m, "")
          .replace(/^stderr:\n\n?/m, "")
          .trim()
      : rawSummary;
  const diffText = typeof part.diffText === "string" ? part.diffText : "";

  const isError = part.status === "error";

  return (
    <box
      flexDirection="column"
      marginY={1}
      paddingLeft={1}
      borderStyle="single"
      border={["left"]}
      borderColor={status.color}
    >
      <box flexDirection="row">
        <text fg={isError ? colors.error : status.color} bold selectable>
          {status.prefix ? `${status.prefix} ` : ""}
          {title}
        </text>
      </box>
      {summary && (
        <box padding={1} marginTop={1} backgroundColor={colors.background}>
          <text fg={isError ? colors.error : colors.text} selectable>
            {summary}
          </text>
        </box>
      )}
      {diffText && (
        <box padding={1} marginTop={1} backgroundColor={colors.background}>
          <diff
            diff={diffText}
            view="unified"
            syntaxStyle={syntaxStyle}
            wrapMode="char"
            conceal={false}
            fg={colors.text}
            // OpenTUI hides the entire gutter, including diff signs, when this is false.
            // Keep the gutter visible but make its line numbers transparent.
            showLineNumbers
            lineNumberFg="transparent"
            addedSignColor={colors.green}
            removedSignColor={colors.error}
            selectable
          />
        </box>
      )}
    </box>
  );
}
