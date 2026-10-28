import React, { useRef, useState } from "react";
import { questionLayout } from "../utils/question-layout.js";
import { useKeyboard, useOnResize, useRenderer } from "@opentui/react";
import { Modal } from "./Modal.component.jsx";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;

export function AskQuestionsDialog({ questions, onAnswer }) {
  const renderer = useRenderer();
  const [size, setSize] = useState({ width: renderer.width, height: renderer.height });
  useOnResize((width, height) => setSize({ width, height }));
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [cursor, setCursor] = useState(0);
  const [focus, setFocus] = useState(questions[0].type === "text" ? "editor" : "choices");
  const [action, setAction] = useState(0);
  const [error, setError] = useState("");
  const editor = useRef(null);
  const q = questions[index];
  const options = q.type === "text" ? [] : [...q.options, ...(q.allowCustom ? ["Other…"] : [])];
  const answer = answers[q.id] ?? { selected: [], text: "" };
  const custom =
    q.type === "text" || Boolean(q.allowCustom && answer.selected.includes(q.options.length));
  const areas = [...(options.length ? ["choices"] : []), ...(custom ? ["editor"] : []), "actions"];
  const actions = [
    ...(index ? ["Back"] : []),
    index === questions.length - 1 ? "Submit" : "Next →",
    "Cancel",
  ];
  const update = (next) => {
    setAnswers((previous) => ({ ...previous, [q.id]: next }));
    setError("");
  };
  const layout = questionLayout(size, q.question, options, custom, cursor);
  function navigate(next) {
    setIndex(next);
    setCursor(0);
    setFocus(questions[next].type === "text" ? "editor" : "choices");
    setAction(0);
    setError("");
  }
  function advance() {
    if (custom ? !answer.text.trim() : !answer.selected.length) {
      setError(
        custom ? "Enter an answer before continuing." : "Select an answer before continuing.",
      );
      setFocus(custom ? "editor" : "choices");
      return;
    }
    if (index < questions.length - 1) return navigate(index + 1);
    onAnswer(
      questions.map((question) => {
        const value = answers[question.id];
        return {
          id: question.id,
          question: question.question,
          choices: value.selected
            .filter((i) => i < (question.options?.length ?? 0))
            .map((i) => question.options[i]),
          text:
            question.type === "text" ||
            (question.allowCustom && value.selected.includes(question.options.length))
              ? value.text.trim()
              : "",
        };
      }),
    );
  }
  useKeyboard((key) => {
    if (key.name === "escape" || (key.ctrl && key.name === "c")) {
      key.preventDefault();
      onAnswer(null);
      return;
    }
    if (layout.tooSmall) return;
    if (key.name === "tab") {
      key.preventDefault();
      setFocus(areas[(areas.indexOf(focus) + (key.shift ? areas.length - 1 : 1)) % areas.length]);
      return;
    }
    if (key.ctrl && key.name === "n") {
      key.preventDefault();
      advance();
      return;
    }
    if (key.ctrl && key.name === "b") {
      key.preventDefault();
      if (index) navigate(index - 1);
      return;
    }
    if (focus === "editor") return;
    if (focus === "choices" && ["pageup", "pagedown"].includes(key.name)) {
      key.preventDefault();
      const next = Math.max(
        0,
        Math.min(layout.pages.length - 1, layout.pageIndex + (key.name === "pageup" ? -1 : 1)),
      );
      setCursor(layout.pages[next]?.[0] ?? 0);
      return;
    }
    if (["up", "down", "left", "right"].includes(key.name)) {
      key.preventDefault();
      const delta = ["up", "left"].includes(key.name) ? -1 : 1;
      if (focus === "choices") setCursor((cursor + delta + options.length) % options.length);
      else setAction((action + delta + actions.length) % actions.length);
    }
    if (key.name === "space" || key.name === "return") {
      key.preventDefault();
      if (focus === "actions") {
        const label = actions[action];
        if (label === "Cancel") onAnswer(null);
        else if (label === "Back") navigate(index - 1);
        else advance();
      } else {
        const selected =
          q.type === "single"
            ? [cursor]
            : answer.selected.includes(cursor)
              ? answer.selected.filter((i) => i !== cursor)
              : [...answer.selected, cursor];
        update({ ...answer, selected });
        if (q.allowCustom && cursor === q.options.length && selected.includes(cursor))
          setFocus("editor");
      }
    }
  });
  if (layout.tooSmall)
    return (
      <Modal
        title="QUESTIONS"
        boundedBackdrop
        width={layout.width}
        height={Math.min(8, size.height)}
      >
        <text fg={colors.warning}>Enlarge the terminal to answer.</text>
        <text fg={colors.muted}>Esc cancel</text>
      </Modal>
    );
  return (
    <Modal title="QUESTIONS" width={layout.width} height={layout.height} boundedBackdrop>
      <text fg={colors.muted} flexShrink={0}>
        Question {index + 1} of {questions.length} ·{" "}
        {q.type === "text"
          ? "Write an answer"
          : q.type === "single"
            ? "Choose one"
            : "Choose one or more"}
      </text>
      <box flexDirection="column" flexGrow={1} minHeight={0}>
        <text fg={colors.text} bold marginY={1}>
          {q.question}
        </text>
        {options.length > 0 && (
          <box
            flexDirection="column"
            border
            borderStyle="rounded"
            borderColor={focus === "choices" ? colors.accent : colors.border}
            paddingX={1}
            height={layout.choicePaneHeight}
            minHeight={layout.choicePaneHeight}
            flexShrink={0}
          >
            <text fg={colors.label} height={1} flexShrink={0}>
              ANSWER
            </text>
            <box flexDirection="column" flexShrink={0}>
              {layout.visible.map((i) => {
                const option = options[i];
                const active = focus === "choices" && cursor === i;
                const checked = answer.selected.includes(i);
                return (
                  <box
                    key={i}
                    backgroundColor={active ? colors.selected : undefined}
                    flexShrink={0}
                  >
                    <text
                      fg={active ? colors.selectedText : colors.text}
                      bold={active}
                    >{`${active ? "›" : " "} ${q.type === "single" ? (checked ? "(●)" : "( )") : checked ? "[x]" : "[ ]"} ${option}`}</text>
                  </box>
                );
              })}
            </box>
            {layout.pages.length > 1 && (
              <text fg={colors.muted} height={1} flexShrink={0}>
                Choices {layout.pageIndex + 1}/{layout.pages.length} · PgUp/PgDn
              </text>
            )}
          </box>
        )}
        {custom && (
          <box
            flexDirection="column"
            border
            borderStyle="rounded"
            borderColor={focus === "editor" ? colors.accent : colors.border}
            paddingX={1}
            height={8}
            minHeight={8}
            marginTop={options.length ? 1 : 0}
          >
            <text fg={colors.label} height={1} flexShrink={0}>
              {q.type === "text" ? "YOUR ANSWER" : "CUSTOM ANSWER"}
            </text>
            <box height={5} minHeight={0} flexGrow={1} overflow="hidden">
              <textarea
                key={q.id}
                ref={editor}
                initialValue={answer.text}
                focused={focus === "editor"}
                showCursor={focus === "editor"}
                wrapMode="word"
                keyBindings={[
                  { name: "return", action: "newline" },
                  { name: "kpenter", action: "newline" },
                  { name: "linefeed", action: "newline" },
                ]}
                flexGrow={1}
                placeholder="Write your answer…"
                onContentChange={() => {
                  const text = editor.current?.plainText ?? "";
                  update({ ...answer, text });
                }}
              />
            </box>
          </box>
        )}
      </box>
      {error && (
        <text fg={colors.warning} flexShrink={0}>
          {error}
        </text>
      )}
      <box flexDirection="row" justifyContent="flex-end" gap={2} marginTop={1} flexShrink={0}>
        {actions.map((label, i) => (
          <box
            key={label}
            paddingX={1}
            backgroundColor={focus === "actions" && action === i ? colors.selected : undefined}
          >
            <text
              fg={
                focus === "actions" && action === i
                  ? colors.selectedText
                  : label === "Cancel"
                    ? colors.muted
                    : colors.accent
              }
              bold
            >{`[ ${label} ]`}</text>
          </box>
        ))}
      </box>
      <text fg={colors.muted} flexShrink={0} marginTop={1}>
        {focus === "editor"
          ? "Enter newline · Tab actions · Esc cancel"
          : focus === "actions"
            ? "←→ action · Enter activate · Tab focus · Esc cancel"
            : "↑↓ move · Space/Enter select · Tab focus · Esc cancel"}
      </text>
    </Modal>
  );
}
