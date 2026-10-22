import React, { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;
import { Modal } from "./Modal.component.jsx";

function modelLabel(modelPath, settings = {}) {
  return settings[modelPath]?.name?.trim() || modelPath.split(/[\\/]/).at(-1);
}

function DeleteModelDialog({ model }) {
  const modelPath = typeof model === "string" ? model : model?.model;
  return (
    <box
      position="absolute"
      top={0}
      right={0}
      bottom={0}
      left={0}
      zIndex={101}
      alignItems="center"
      justifyContent="center"
    >
      <box
        width="58%"
        maxWidth={72}
        flexDirection="column"
        backgroundColor={colors.overlay}
        border
        borderStyle="rounded"
        borderColor={colors.error}
        paddingX={2}
        paddingY={1}
      >
        <text fg={colors.error} bold>
          DELETE LOCAL MODEL
        </text>
        <text fg={colors.text} marginTop={1} wrapMode="word">
          Delete {modelPath} from local storage? This cannot be undone.
        </text>
        <text fg={colors.hint} marginTop={1}>
          Enter confirm · Esc cancel
        </text>
      </box>
    </box>
  );
}

export function ModelChooser({
  models = [],
  modelSettings = {},
  classifier,
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
  onDeleteModel,
  onRefreshWorkerModels,
}) {
  const [tier, setTier] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeControl, setActiveControl] = useState(0);
  const [classifierIndex, setClassifierIndex] = useState(0);
  const [workerIndex, setWorkerIndex] = useState(0);
  const classifierScroll = useRef(null);
  const workerScroll = useRef(null);
  const { width: terminalWidth } = useTerminalDimensions();
  const classifierOptions = useMemo(() => {
    const options = [
      { name: "Routing disabled", description: "Do not classify requests", value: null },
      ...models.map((model) => ({
        name: `Local · ${modelLabel(model, modelSettings)}`,
        description: model,
        value: model,
      })),
      ...openAIModels.map((model) => ({
        name: `OpenAI · ${model.name}`,
        description: model.id,
        value: { provider: "openai", model: model.id },
      })),
    ];
    if (
      classifier?.provider === "openai" &&
      classifier.model &&
      !openAIModels.some((model) => model.id === classifier.model)
    )
      options.push({
        name: `OpenAI · ${classifier.model}`,
        description: classifier.model,
        value: classifier,
      });
    return options;
  }, [classifier, modelSettings, models, openAIModels]);
  const workerOptions = useMemo(() => {
    const options = openAIModels.map((model) => ({
      name: `OpenAI · ${model.name}`,
      description: model.id,
      value: { provider: "openai", model: model.id },
    }));
    const known = new Set(openAIModels.map((model) => model.id));
    for (const worker of Object.values(tierWorkers)) {
      if (worker?.provider === "openai" && worker.model && !known.has(worker.model)) {
        options.push({
          name: `OpenAI · ${worker.model}`,
          description: worker.model,
          value: worker,
        });
        known.add(worker.model);
      }
    }
    if (defaultOpenAIModel && !known.has(defaultOpenAIModel))
      options.push({
        name: `OpenAI · ${defaultOpenAIModel}`,
        description: defaultOpenAIModel,
        value: { provider: "openai", model: defaultOpenAIModel },
      });
    for (const model of models)
      options.push({
        name: `Local · ${modelLabel(model, modelSettings)}`,
        description: model,
        value: { provider: "local", model },
      });
    return options;
  }, [defaultOpenAIModel, modelSettings, models, openAIModels, tierWorkers]);
  const configuredWorker = tierWorkers[tier];
  const worker = configuredWorker?.model || defaultOpenAIModel || "Worker not selected";
  const classifierLabel = classifier
    ? classifier.provider === "local"
      ? modelLabel(classifier.model, modelSettings)
      : classifier.model
    : "Router disabled";
  const isClassifierOptionConfigured = (option) => {
    if (option.value === null) return !classifier;
    const provider = typeof option.value === "string" ? "local" : option.value.provider;
    const model = typeof option.value === "string" ? option.value : option.value.model;
    return provider === classifier?.provider && model === classifier?.model;
  };

  useEffect(() => {
    const index = classifierOptions.findIndex((option) =>
      option.value === null
        ? !classifier
        : (typeof option.value === "string" ? "local" : option.value.provider) ===
            classifier?.provider &&
          (typeof option.value === "string" ? option.value : option.value.model) ===
            classifier?.model,
    );
    if (index >= 0) setClassifierIndex(index);
  }, [classifier, classifierOptions]);

  useEffect(() => {
    const index = workerOptions.findIndex(
      (option) =>
        option.value.provider === configuredWorker?.provider && option.value.model === worker,
    );
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
    if (confirmDelete) {
      if (key.name === "return") {
        const model = classifierOptions[classifierIndex]?.value;
        if (typeof model === "string" || model?.provider === "local")
          onDeleteModel(typeof model === "string" ? model : model.model);
        setConfirmDelete(false);
      } else if (key.name === "escape") {
        setConfirmDelete(false);
      }
      key.preventDefault();
      return;
    }
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
    if (
      key.name === "d" &&
      key.ctrl &&
      activeControl === 0 &&
      classifierOptions[classifierIndex]?.value
    ) {
      key.preventDefault();
      setConfirmDelete(true);
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
      if (option) onSetTierWorker(tier, option.value);
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
    <Modal
      title="ROUTING & MODEL ASSIGNMENTS"
      fullScreen
      dimmed={confirmDelete}
      overlay={
        confirmDelete ? (
          <DeleteModelDialog
            model={modelLabel(
              classifierOptions[classifierIndex]?.value?.model ??
                classifierOptions[classifierIndex]?.value,
              modelSettings,
            )}
          />
        ) : null
      }
    >
      <text fg={colors.muted} height={1} flexShrink={0} truncate>
        Select a router and assign a local or OpenAI worker to each tier.
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
          {classifierLabel} → Tier {tier} → {worker}
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
                const configured = isClassifierOptionConfigured(option);
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
                  const configured =
                    option.value.provider === configuredWorker?.provider &&
                    option.value.model === worker;
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
                Download a local model or sign in to OpenAI to choose a worker.
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
        1–3 / Tab choose section · ↑↓ select · Enter apply · Ctrl+D delete · R refresh · Esc close
      </text>
    </Modal>
  );
}
