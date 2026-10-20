import React, { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { browserColors as colors } from "./model-browser-theme.js";
import { OpenTuiModal } from "./modal.component.jsx";

function modelLabel(modelPath, settings = {}) {
  return settings[modelPath]?.name?.trim() || modelPath.split(/[\\/]/).at(-1);
}

export function OpenTuiModelChooser({
  models = [],
  modelSettings = {},
  classifierModel,
  tierWorkers = {},
  openAIModels = [],
  defaultOpenAIModel,
  loadingClassifier,
  loadingOpenAIModels,
  openAIError,
  error,
  onClose,
  onSetClassifier,
  onSetTierWorker,
  onRefreshWorkerModels,
}) {
  const [tier, setTier] = useState(1);
  const [activeControl, setActiveControl] = useState(0);
  const [classifierIndex, setClassifierIndex] = useState(0);
  const [workerIndex, setWorkerIndex] = useState(0);
  const classifierScroll = useRef(null);
  const workerScroll = useRef(null);
  const { width: terminalWidth } = useTerminalDimensions();
  const classifierOptions = useMemo(
    () => [
      { name: "Routing disabled", description: "Do not classify requests", value: null },
      ...models.map((model) => ({
        name: modelLabel(model, modelSettings),
        description: model,
        value: model,
      })),
    ],
    [models, modelSettings],
  );
  const workerOptions = useMemo(() => {
    const byId = new Map(openAIModels.map((model) => [model.id, model]));
    for (const worker of Object.values(tierWorkers)) {
      if (worker?.provider === "openai" && worker.model && !byId.has(worker.model))
        byId.set(worker.model, { id: worker.model, name: worker.model });
    }
    if (defaultOpenAIModel && !byId.has(defaultOpenAIModel))
      byId.set(defaultOpenAIModel, { id: defaultOpenAIModel, name: defaultOpenAIModel });
    return [...byId.values()].map((model) => ({
      name: `OpenAI · ${model.name}`,
      description: model.id,
      value: model.id,
    }));
  }, [defaultOpenAIModel, openAIModels, tierWorkers]);
  const configuredWorker = tierWorkers[tier];
  const worker =
    configuredWorker?.provider === "openai"
      ? configuredWorker.model
      : defaultOpenAIModel || "OpenAI model not selected";

  useEffect(() => {
    const index = classifierOptions.findIndex((option) => option.value === classifierModel);
    if (index >= 0) setClassifierIndex(index);
  }, [classifierModel, classifierOptions]);

  useEffect(() => {
    const index = workerOptions.findIndex((option) => option.value === worker);
    if (index >= 0) setWorkerIndex(index);
  }, [worker, workerOptions]);
  const usableWidth = Math.max(1, terminalWidth - 4);
  // Keep all three sections visible at practical widths. The worker section is
  // useful context for the selected tier, so it should not disappear on a
  // semi-large terminal just because the layout is below the full-screen width.
  const narrow = usableWidth < 92;
  const medium = usableWidth < 120;
  const visible = narrow ? [activeControl] : medium ? [0, 1] : [0, 1, 2];

  useEffect(() => {
    if (activeControl === 0)
      classifierScroll.current?.scrollChildIntoView(`router-${classifierIndex}`);
    if (activeControl === 2) workerScroll.current?.scrollChildIntoView(`worker-${workerIndex}`);
  }, [activeControl, classifierIndex, workerIndex]);

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      onClose();
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      setActiveControl((current) => (current + (key.shift ? 2 : 1)) % 3);
      return;
    }
    // On narrow terminals only the active pane is rendered, so horizontal
    // navigation moves between the three sections.
    if (key.name === "left" || key.name === "right") {
      key.preventDefault();
      setActiveControl((current) => (current + (key.name === "left" ? 2 : 1)) % 3);
      return;
    }
    if (["1", "2", "3"].includes(key.name)) {
      key.preventDefault();
      setActiveControl(Number(key.name) - 1);
      return;
    }
    if (key.name === "r" && activeControl === 2 && !key.ctrl && !key.meta) {
      key.preventDefault();
      onRefreshWorkerModels();
      return;
    }
    if (activeControl === 0) {
      if (key.name === "up")
        setClassifierIndex(
          (current) => (current - 1 + classifierOptions.length) % classifierOptions.length,
        );
      if (key.name === "down")
        setClassifierIndex((current) => (current + 1) % classifierOptions.length);
      if (key.name === "return") {
        onSetClassifier(classifierOptions[classifierIndex]?.value ?? null);
        setActiveControl(1);
      }
    } else if (activeControl === 1) {
      if (key.name === "up") setTier((value) => (value + 1) % 3 || 3);
      if (key.name === "down") setTier((value) => (value % 3) + 1);
      if (key.name === "return") setActiveControl(2);
    } else if (key.name === "up" || key.name === "down") {
      if (!workerOptions.length) return;
      setWorkerIndex((current) => {
        const delta = key.name === "up" ? -1 : 1;
        return (current + delta + workerOptions.length) % workerOptions.length;
      });
    } else if (key.name === "return") {
      const option = workerOptions[workerIndex];
      if (option) onSetTierWorker(tier, { provider: "openai", model: option.value });
    }
  });

  const pane = (index, title, children, footer) => (
    <box
      key={index}
      flexGrow={1}
      flexBasis={0}
      minWidth={0}
      minHeight={0}
      flexDirection="column"
      border
      borderStyle="rounded"
      borderColor={activeControl === index ? colors.accent : colors.border}
      paddingX={1}
    >
      <text
        height={1}
        flexShrink={0}
        fg={activeControl === index ? colors.accent : colors.label}
        bold
        truncate
      >
        {title}
      </text>
      <box height={1} flexShrink={0} />
      {children}
      <text height={1} flexShrink={0} fg={colors.hint} truncate>
        {footer}
      </text>
    </box>
  );

  return (
    <OpenTuiModal title="ROUTING & MODEL ASSIGNMENTS" fullScreen>
      <text fg={colors.muted} height={1} flexShrink={0} truncate>
        Select a router and assign an OpenAI worker to each tier.
      </text>
      <box
        height={3}
        flexShrink={0}
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={colors.border}
        paddingX={1}
        marginTop={1}
        marginBottom={1}
        minWidth={0}
      >
        <text height={1} flexShrink={0} fg={colors.text} truncate>
          {classifierModel ? modelLabel(classifierModel, modelSettings) : "Router disabled"} → Tier{" "}
          {tier} → {worker}
        </text>
      </box>
      <box flexGrow={1} minHeight={0} flexDirection="row" gap={1}>
        {visible.includes(0) &&
          pane(
            0,
            "01 ROUTER MODEL",
            <scrollbox
              ref={classifierScroll}
              flexGrow={1}
              minHeight={0}
              scrollY
              scrollX={false}
              contentOptions={{ flexDirection: "column" }}
            >
              {classifierOptions.map((option, index) => {
                const selected = activeControl === 0 && index === classifierIndex;
                const configured = option.value === classifierModel;
                return (
                  <box
                    key={option.name}
                    id={`router-${index}`}
                    flexDirection="column"
                    flexShrink={0}
                    minWidth={0}
                    backgroundColor={selected ? colors.selected : undefined}
                    paddingX={1}
                  >
                    <text
                      fg={configured ? colors.green : selected ? colors.selectedText : colors.text}
                      bold={selected || configured}
                      truncate
                    >
                      {selected ? "› " : "· "}
                      {option.name}
                      {configured ? " ✓" : ""}
                    </text>
                  </box>
                );
              })}
            </scrollbox>,
            loadingClassifier ? "Loading locally…" : "↑↓ select · Enter next",
          )}
        {visible.includes(1) &&
          pane(
            1,
            "02 TIERS",
            <scrollbox
              flexGrow={1}
              minHeight={0}
              scrollY
              scrollX={false}
              contentOptions={{ flexDirection: "column" }}
            >
              {[1, 2, 3].map((number) => {
                const selected = activeControl === 1 && tier === number;
                const configured = Boolean(tierWorkers[number]?.model || defaultOpenAIModel);
                return (
                  <box
                    key={number}
                    flexDirection="column"
                    flexShrink={0}
                    backgroundColor={selected ? colors.selected : undefined}
                    paddingX={1}
                  >
                    <text
                      fg={configured ? colors.green : selected ? colors.selectedText : colors.text}
                      bold={selected || configured}
                      truncate
                    >
                      {selected ? "› " : "· "}Tier {number} ·{" "}
                      {tierWorkers[number]?.model || defaultOpenAIModel || "Not configured"}
                    </text>
                  </box>
                );
              })}
            </scrollbox>,
            "↑↓ select · Enter assign",
          )}
        {visible.includes(2) &&
          pane(
            2,
            `03 TIER ${tier} WORKER`,
            workerOptions.length ? (
              <scrollbox
                ref={workerScroll}
                flexGrow={1}
                minHeight={0}
                scrollY
                scrollX={false}
                contentOptions={{ flexDirection: "column" }}
              >
                {workerOptions.map((option, index) => {
                  const selected = activeControl === 2 && index === workerIndex;
                  const configured = option.value === worker;
                  return (
                    <box
                      key={option.value}
                      flexDirection="column"
                      flexShrink={0}
                      backgroundColor={selected ? colors.selected : undefined}
                      paddingX={1}
                    >
                      <text
                        fg={
                          configured ? colors.green : selected ? colors.selectedText : colors.text
                        }
                        bold={selected || configured}
                        truncate
                      >
                        {selected ? "› " : "· "}
                        {option.name}
                        {configured ? " ✓" : ""}
                      </text>
                    </box>
                  );
                })}
              </scrollbox>
            ) : (
              <text fg={colors.muted} wrapMode="word">
                Sign in to OpenAI to choose a worker model.
              </text>
            ),
            loadingOpenAIModels ? "Loading OpenAI…" : openAIError || "↑↓ choose · R refresh",
          )}
      </box>
      <text
        height={1}
        flexShrink={0}
        fg={error || openAIError ? colors.error : colors.muted}
        truncate
      >
        {error || openAIError || " "}
      </text>
      <text height={1} flexShrink={0} fg={colors.hint} truncate>
        1–3 / Tab choose section · ↑↓ select · Enter apply · R refresh · Esc close
      </text>
    </OpenTuiModal>
  );
}
