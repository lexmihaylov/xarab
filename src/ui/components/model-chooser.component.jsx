import React, { useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { Dialog } from "./dialog.component.jsx";

function modelLabel(modelPath, settings = {}) {
  return settings[modelPath]?.name?.trim() || modelPath.split(/[\\/]/).at(-1);
}

export function ModelChooser({
  models = [],
  modelSettings = {},
  directory,
  classifierModel,
  tierWorkers = {},
  openAIModels = [],
  defaultOpenAIModel,
  loadingClassifier = false,
  loadingOpenAIModels = false,
  openAIError,
  width,
  height,
  error,
  onClose,
  onSetClassifier = () => {},
  onSetTierWorker = () => {},
  onRefreshWorkerModels = () => {},
}) {
  const [section, setSection] = useState(0);
  const [classifierIndex, setClassifierIndex] = useState(0);
  const [tier, setTier] = useState(1);
  const [workerIndex, setWorkerIndex] = useState(0);
  const classifierOptions = useMemo(
    () => [
      { value: null, label: "Routing disabled" },
      ...models.map((modelPath) => ({
        value: modelPath,
        label: modelLabel(modelPath, modelSettings),
      })),
    ],
    [models, modelSettings],
  );
  const workerOptions = useMemo(() => {
    const remoteModels = [...openAIModels];
    const configuredIds = new Set(remoteModels.map((model) => model.id));
    for (const worker of Object.values(tierWorkers)) {
      if (worker?.provider === "openai" && worker.model && !configuredIds.has(worker.model)) {
        remoteModels.push({ id: worker.model, name: worker.model });
        configuredIds.add(worker.model);
      }
    }
    if (defaultOpenAIModel && !configuredIds.has(defaultOpenAIModel))
      remoteModels.push({ id: defaultOpenAIModel, name: defaultOpenAIModel });
    return remoteModels.map((model) => ({
      provider: "openai",
      model: model.id,
      label: `OpenAI · ${model.name}`,
    }));
  }, [models, modelSettings, openAIModels, tierWorkers, defaultOpenAIModel]);

  const configuredWorker = tierWorkers[tier];
  const currentWorker =
    configuredWorker?.provider === "openai" ? configuredWorker : { provider: "openai" };
  const currentWorkerModel = currentWorker.model || defaultOpenAIModel;

  useEffect(() => {
    const selected = classifierOptions.findIndex((option) => option.value === classifierModel);
    if (selected >= 0) setClassifierIndex(selected);
  }, [classifierOptions, classifierModel]);

  useEffect(() => {
    const selected = workerOptions.findIndex(
      (option) => option.provider === currentWorker.provider && option.model === currentWorkerModel,
    );
    if (selected >= 0) setWorkerIndex(selected);
  }, [workerOptions, currentWorker.provider, currentWorkerModel]);

  useInput((input, key) => {
    if (key.escape) return onClose();
    if (input === "1" || input === "2" || input === "3") {
      setSection(Number(input) - 1);
      return;
    }
    if (key.tab || input === "\t") {
      setSection((value) => (value + (key.shift ? 2 : 1)) % 3);
      return;
    }
    if (key.leftArrow || key.rightArrow) {
      setSection((value) => (value + (key.leftArrow ? 2 : 1)) % 3);
      return;
    }
    if (section === 0) {
      if (key.upArrow)
        setClassifierIndex(
          (value) => (value - 1 + classifierOptions.length) % classifierOptions.length,
        );
      if (key.downArrow) setClassifierIndex((value) => (value + 1) % classifierOptions.length);
      if (key.return) {
        onSetClassifier(classifierOptions[classifierIndex]?.value ?? null);
        setSection(1);
      }
      return;
    }
    if (section === 1) {
      if (key.upArrow) setTier((value) => (value + 1) % 3 || 3);
      if (key.downArrow) setTier((value) => (value % 3) + 1);
      if (key.return) setSection(2);
      return;
    }
    if (input.toLowerCase() === "r") {
      onRefreshWorkerModels();
      return;
    }
    if (!workerOptions.length) return;
    if (key.upArrow)
      setWorkerIndex((value) => (value - 1 + workerOptions.length) % workerOptions.length);
    if (key.downArrow) setWorkerIndex((value) => (value + 1) % workerOptions.length);
    if (key.return) {
      const selected = workerOptions[workerIndex];
      if (selected) onSetTierWorker(tier, { provider: selected.provider, model: selected.model });
    }
  });

  return (
    <Dialog
      title="ROUTING & MODEL ASSIGNMENTS"
      width={width}
      height={height}
      maxWidth={132}
      expanded
    >
      {({ contentWidth, dialogHeight }) => {
        const columnWidth = Math.floor((contentWidth - 2) / 3);
        const rowsPerSection = Math.max(1, dialogHeight - 13);
        const startFor = (selected, count) =>
          Math.max(0, Math.min(selected - rowsPerSection + 1, count - rowsPerSection));
        const classifierStart = startFor(classifierIndex, classifierOptions.length);
        const workerStart = startFor(workerIndex, workerOptions.length);
        const renderOption = (option, index, selected, current, width = columnWidth - 4) => (
          <Box key={`${option.label}-${index}`} width={width}>
            <Text
              color={selected ? "#a8d5a2" : current ? "#8fbfdc" : "#e5e9f0"}
              backgroundColor={selected ? "#36505f" : undefined}
              wrap="truncate"
            >
              {selected ? "› " : "· "}
              {option.label}
              {current ? " ✓" : ""}
            </Text>
          </Box>
        );
        const cardStyle = (index) => ({
          flexDirection: "column",
          width: columnWidth,
          flexShrink: 0,
          paddingX: 1,
          paddingY: 1,
          borderStyle: "round",
          borderColor: section === index ? "#8fbfdc" : "#526273",
          borderBackgroundColor: "#202d38",
          overflow: "hidden",
        });
        const cardHeading = (index, number, title, subtitle) => (
          <Box flexDirection="column" width={columnWidth - 4} marginBottom={1}>
            <Text bold color={section === index ? "#8fbfdc" : "#e5e9f0"} wrap="truncate">
              {number} {title}
            </Text>
            <Text color="#aeb8c4" wrap="truncate">
              {subtitle}
            </Text>
          </Box>
        );

        return (
          <>
            <Box width={contentWidth} marginBottom={1}>
              <Text color="#aeb8c4" wrap="truncate">
                Choose a router, select a tier, then assign that tier a worker.
              </Text>
            </Box>
            <Box
              width={contentWidth}
              flexDirection="row"
              justifyContent="space-between"
              marginBottom={1}
              paddingX={1}
              paddingY={1}
              borderStyle="round"
              borderColor="#526273"
               borderBackgroundColor="#202d38"
            >
              <Text color="#e5e9f0" wrap="truncate">
                {classifierModel ? modelLabel(classifierModel, modelSettings) : "Router disabled"}
                {`  →  Tier ${tier}  →  `}
                {currentWorkerModel || "OpenAI model not selected"}
              </Text>
            </Box>
            <Box
              flexDirection="row"
              width={contentWidth}
              flexGrow={1}
              overflow="hidden"
              justifyContent="space-between"
            >
              <Box {...cardStyle(0)}>
                {cardHeading(
                  0,
                  "01",
                  "ROUTER MODEL",
                  loadingClassifier ? "Loading locally…" : classifierModel ? "Active" : "Disabled",
                )}
                {classifierOptions
                  .slice(classifierStart, classifierStart + rowsPerSection)
                  .map((option, index) => {
                    const actualIndex = classifierStart + index;
                    return renderOption(
                      option,
                      actualIndex,
                      section === 0 && actualIndex === classifierIndex,
                      option.value === classifierModel,
                    );
                  })}
              </Box>
              <Box {...cardStyle(1)}>
                <Box width={columnWidth - 4} marginBottom={1}>
                  <Text bold color={section === 1 ? "#8fbfdc" : "#e5e9f0"} wrap="truncate">
                    02 TIERS · ↑↓ select
                  </Text>
                </Box>
                {[1, 2, 3].map((tierNumber) => {
                  const configured = tierWorkers[tierNumber];
                  const worker = configured?.provider === "openai" ? configured : {};
                  const workerName = worker.model || defaultOpenAIModel || "OpenAI not selected";
                  return renderOption(
                    { label: `Tier ${tierNumber} · OpenAI · ${workerName}` },
                    tierNumber,
                    section === 1 && tier === tierNumber,
                    tier === tierNumber,
                  );
                })}
              </Box>
              <Box {...cardStyle(2)}>
                {cardHeading(2, "03", `TIER ${tier} WORKER`, "↑↓ choose · Enter assign")}
                {workerOptions.length ? (
                  workerOptions
                    .slice(workerStart, workerStart + rowsPerSection)
                    .map((option, index) => {
                      const actualIndex = workerStart + index;
                      return renderOption(
                        option,
                        actualIndex,
                        section === 2 && actualIndex === workerIndex,
                        option.provider === "openai" && option.model === currentWorkerModel,
                      );
                    })
                ) : (
                  <Text color="#aeb8c4" wrap="truncate">
                    Sign in to OpenAI to choose a worker model.
                  </Text>
                )}
                {loadingOpenAIModels && <Text color="#aeb8c4">Loading OpenAI…</Text>}
                {!loadingOpenAIModels && openAIError && (
                  <Text color="#e6b86a" wrap="truncate">
                    OpenAI unavailable (R retry)
                  </Text>
                )}
              </Box>
            </Box>
            {(error || openAIError) && (
              <Box width={contentWidth}>
                <Text color="#ef7777" wrap="truncate">
                  {error || openAIError}
                </Text>
              </Box>
            )}
            <Box width={contentWidth} borderTop borderTopColor="#526273">
              <Text color="#aeb8c4" wrap="truncate">
                1–3 / Tab / ←→ section ↑↓ select Enter apply/assign R refresh Esc close
              </Text>
            </Box>
          </>
        );
      }}
    </Dialog>
  );
}
