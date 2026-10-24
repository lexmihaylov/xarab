import React, { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;
import { Modal } from "./Modal.component.jsx";

function providerLabel(provider) {
  return { local: "Local", openai: "OpenAI", openrouter: "OpenRouter" }[provider] ?? provider;
}

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
  defaultOpenAIModel,
  loadingClassifier,
  loadingProviderModels,
  providerModelError,
  error,
  onClose,
  onSetClassifier,
  onSetTierWorker,
  onDeleteModel,
  onRefreshWorkerModels,
  onOpenProviders,
}) {
  const [tier, setTier] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [activeControl, setActiveControl] = useState(0);
  const [classifierIndex, setClassifierIndex] = useState(0);
  const [workerIndex, setWorkerIndex] = useState(0);
  const [routerQuery, setRouterQuery] = useState("");
  const [workerQuery, setWorkerQuery] = useState("");
  const classifierScroll = useRef(null);
  const workerScroll = useRef(null);
  const { width: terminalWidth } = useTerminalDimensions();
  const classifierOptions = useMemo(() => {
    const options = [
      { name: "Routing disabled", description: "Do not classify requests", value: null },
      ...models.map((model) => ({
        name: `${providerLabel(model.provider)} · ${model.name}`,
        description: model.id,
        value: { provider: model.provider, model: model.id },
      })),
    ];
    if (
      classifier?.provider !== "local" &&
      classifier?.model &&
      !models.some(
        (model) => model.provider === classifier.provider && model.id === classifier.model,
      )
    )
      options.push({
        name: `${providerLabel(classifier.provider)} · ${classifier.model}`,
        description: classifier.model,
        value: classifier,
      });
    return options;
  }, [classifier, models]);
  const workerOptions = useMemo(() => {
    const options = models.map((model) => ({
      name: `${providerLabel(model.provider)} · ${model.name}`,
      description: model.id,
      value: { provider: model.provider, model: model.id },
    }));
    const known = new Set(models.map((model) => `${model.provider}:${model.id}`));
    for (const worker of Object.values(tierWorkers)) {
      if (
        worker?.provider !== "local" &&
        worker?.model &&
        !known.has(`${worker.provider}:${worker.model}`)
      ) {
        options.push({
          name: `${providerLabel(worker.provider)} · ${worker.model}`,
          description: worker.model,
          value: worker,
        });
        known.add(`${worker.provider}:${worker.model}`);
      }
    }
    if (defaultOpenAIModel && !known.has(`openai:${defaultOpenAIModel}`))
      options.push({
        name: `OpenAI · ${defaultOpenAIModel}`,
        description: defaultOpenAIModel,
        value: { provider: "openai", model: defaultOpenAIModel },
      });
    return options;
  }, [defaultOpenAIModel, models, tierWorkers]);
  const filterOptions = (options, query) =>
    options.filter((option) =>
      `${option.name} ${option.description}`.toLowerCase().includes(query.trim().toLowerCase()),
    );
  const visibleClassifiers = filterOptions(classifierOptions, routerQuery);
  const visibleWorkers = filterOptions(workerOptions, workerQuery);
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
  const selectedClassifier = visibleClassifiers[classifierIndex]?.value;
  const canDeleteSelectedClassifier =
    typeof selectedClassifier === "string" || selectedClassifier?.provider === "local";

  useEffect(() => {
    const index = visibleClassifiers.findIndex((option) =>
      option.value === null
        ? !classifier
        : (typeof option.value === "string" ? "local" : option.value.provider) ===
            classifier?.provider &&
          (typeof option.value === "string" ? option.value : option.value.model) ===
            classifier?.model,
    );
    setClassifierIndex(Math.max(0, index));
  }, [classifier, routerQuery, models]);

  useEffect(() => {
    const index = visibleWorkers.findIndex(
      (option) =>
        option.value.provider === configuredWorker?.provider && option.value.model === worker,
    );
    setWorkerIndex(Math.max(0, index));
  }, [worker, workerQuery, models, tier]);
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
        const model = visibleClassifiers[classifierIndex]?.value;
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
    if (activeControl === 1 && (key.name === "left" || key.name === "right")) {
      key.preventDefault();
      setActiveControl((current) => (current + (key.name === "left" ? 2 : 1)) % 3);
      return;
    }
    if (activeControl === 1 && ["1", "2", "3"].includes(key.name)) {
      key.preventDefault();
      setActiveControl(Number(key.name) - 1);
      return;
    }
    if (key.name === "r" && activeControl === 2 && key.ctrl) {
      key.preventDefault();
      onRefreshWorkerModels();
      return;
    }
    if (key.name === "d" && key.ctrl && activeControl === 0 && canDeleteSelectedClassifier) {
      key.preventDefault();
      setConfirmDelete(true);
      return;
    }
    if (activeControl === 0) {
      if (visibleClassifiers.length && (key.name === "up" || key.name === "down")) {
        key.preventDefault();
        setClassifierIndex(
          (current) =>
            (current + (key.name === "up" ? -1 : 1) + visibleClassifiers.length) %
            visibleClassifiers.length,
        );
      }
      if (key.name === "return" && visibleClassifiers[classifierIndex]) {
        key.preventDefault();
        onSetClassifier(visibleClassifiers[classifierIndex].value);
        setActiveControl(1);
      }
    } else if (activeControl === 1) {
      if (key.name === "up") setTier((value) => (value + 1) % 3 || 3);
      if (key.name === "down") setTier((value) => (value % 3) + 1);
      if (key.name === "return") setActiveControl(2);
    } else if (key.name === "up" || key.name === "down") {
      if (!visibleWorkers.length) return;
      key.preventDefault();
      setWorkerIndex((current) => {
        const delta = key.name === "up" ? -1 : 1;
        return (current + delta + visibleWorkers.length) % visibleWorkers.length;
      });
    } else if (key.name === "return") {
      const option = visibleWorkers[workerIndex];
      if (option) {
        key.preventDefault();
        onSetTierWorker(tier, option.value);
      }
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
      {index === 1 && <box height={1} flexShrink={0} />}
      <box flexGrow={1} flexShrink={1} minHeight={0} overflow="hidden" flexDirection="column">
        {children}
      </box>
      <box height={1} flexShrink={0} overflow="hidden" backgroundColor={colors.overlay}>
        <text height={1} fg={colors.hint} truncate>
          {footer}
        </text>
      </box>
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
              visibleClassifiers[classifierIndex]?.value?.model ??
                visibleClassifiers[classifierIndex]?.value,
              modelSettings,
            )}
          />
        ) : null
      }
    >
      <text fg={colors.muted} height={1} flexShrink={0} truncate>
        Select a router and assign a provider model to each tier.
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
            <box flexGrow={1} minHeight={0} flexDirection="column">
              <box flexShrink={0} flexDirection="column">
                <box height={1} backgroundColor={colors.border} paddingX={1}>
                  <input
                    value={routerQuery}
                    placeholder="Search router models…"
                    placeholderColor={colors.text}
                    focused={activeControl === 0 && !confirmDelete}
                    onInput={setRouterQuery}
                    width="100%"
                  />
                </box>
              </box>
              <box height={1} flexShrink={0} />
              <scrollbox
                ref={classifierScroll}
                flexGrow={1}
                flexShrink={1}
                minHeight={0}
                overflow="hidden"
                scrollY
                scrollX={false}
                contentOptions={{ flexDirection: "column" }}
              >
                {visibleClassifiers.map((option, index) => {
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
                {!visibleClassifiers.length && <text fg={colors.muted}>No matching models</text>}
              </scrollbox>
            </box>,
            loadingClassifier ? "Loading locally…" : "Type to filter · ↑↓ select · Enter next",
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
              <box flexGrow={1} minHeight={0} flexDirection="column">
                <box flexShrink={0} flexDirection="column">
                  <box height={1} backgroundColor={colors.border} paddingX={1}>
                    <input
                      value={workerQuery}
                      placeholder="Search worker models…"
                      placeholderColor={colors.text}
                      focused={activeControl === 2 && !confirmDelete}
                      onInput={setWorkerQuery}
                      width="100%"
                    />
                  </box>
                </box>
                <box height={1} flexShrink={0} />
                <scrollbox
                  ref={workerScroll}
                  flexGrow={1}
                  flexShrink={1}
                  minHeight={0}
                  overflow="hidden"
                  scrollY
                  scrollX={false}
                  contentOptions={{ flexDirection: "column" }}
                >
                  {visibleWorkers.map((option, index) => {
                    const selected = activeControl === 2 && index === workerIndex;
                    const configured =
                      option.value.provider === configuredWorker?.provider &&
                      option.value.model === worker;
                    return (
                      <box
                        key={`${option.value.provider}:${option.value.model}`}
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
                  {!visibleWorkers.length && <text fg={colors.muted}>No matching models</text>}
                </scrollbox>
              </box>
            ) : (
              <text fg={colors.muted} wrapMode="word">
                Download a local model or sign in to OpenAI to choose a worker.
              </text>
            ),
            loadingProviderModels
              ? "Loading providers…"
              : providerModelError || "Type to filter · ↑↓ choose · Ctrl+R refresh",
          )}
      </box>
      <text
        height={1}
        flexShrink={0}
        fg={error || providerModelError ? colors.error : colors.muted}
        truncate
      >
        {error || providerModelError || " "}
      </text>
      <text height={1} flexShrink={0} fg={colors.hint} truncate>
        {`Tab choose section · ←→ edit search · ↑↓ select · Enter apply · ${
          canDeleteSelectedClassifier ? "Ctrl+D delete · " : ""
        }Ctrl+R refresh · /connect providers · Esc close`}
      </text>
    </Modal>
  );
}
