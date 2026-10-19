import React, { useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ControlledMultilineInput } from "ink-multiline-input";
import { getHuggingFaceModelDetails } from "../../agent/model-search.js";
import { cleanModelText as clean, compactCount, modelDetailRows } from "../model-browser-view.js";
import { DownloadProgressDialog } from "./download-progress-dialog.component.jsx";
import { browserColors, dimmedColors } from "../model-browser-theme.js";
import { previousTextPosition, nextTextPosition } from "../text-cursor.js";
export { modelDetailLines } from "../model-browser-view.js";

const panes = ["search", "results", "files", "details"];
const detailTabs = ["Overview", "Model card", "Metadata"];
const emptyModels = [];

export function formatModelSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "size unknown";
  const size = bytes / 1_000_000_000;
  return `${size < 10 ? size.toFixed(1) : Math.round(size)} GB`;
}

export function ModelDownloader({
  downloads = emptyModels,
  searching,
  downloading,
  canceling,
  downloadedSize,
  totalSize,
  downloadFileName,
  downloadNotice,
  progress = 0,
  error,
  query = "",
  searchQuery = "",
  width,
  height,
  onClose,
  onSearch,
  onDownloadSelected,
  onCancelDownload,
}) {
  const colors = downloading ? dimmedColors : browserColors;
  const [searchText, setSearchText] = useState(query);
  const [searchCursor, setSearchCursor] = useState(query.length);
  const [focus, setFocus] = useState("search");
  const [modelIndex, setModelIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [detailTab, setDetailTab] = useState("Overview");
  const [detailState, setDetailState] = useState({});
  const cache = useRef(new Map());
  const model = downloads[modelIndex];
  const details = detailState.id === model?.name ? detailState.data : null;
  const loading = Boolean(model && (detailState.id !== model.name || detailState.loading));
  const detailError = detailState.id === model?.name ? detailState.error : null;
  const files = details?.files ?? model?.files ?? [];
  const screenWidth = Math.max(1, width - 4);
  const screenHeight = Math.max(1, height - 2);
  const narrow = screenWidth < 76;
  const threeColumns = screenWidth >= 110;
  const showLeft = !narrow || focus === "search" || focus === "results";
  const showFiles = threeColumns || (narrow ? focus === "files" : focus !== "details");
  const showRight = threeColumns || focus === "details";
  const leftWidth = narrow
    ? screenWidth
    : Math.max(28, Math.floor(screenWidth * (threeColumns ? 0.3 : 0.4)));
  const filesWidth = narrow
    ? screenWidth
    : threeColumns
      ? Math.max(26, Math.floor(screenWidth * 0.24))
      : screenWidth - leftWidth - 1;
  const rightWidth = narrow
    ? screenWidth
    : screenWidth - leftWidth - (threeColumns ? filesWidth + 2 : 1);
  const bodyHeight = Math.max(1, screenHeight - 9);
  const innerHeight = Math.max(1, bodyHeight - 2);
  const resultHeight = screenHeight >= 28 ? 4 : 3;
  const listCount = Math.max(1, Math.floor((innerHeight - 2) / resultHeight));
  const fileHeight = screenHeight >= 28 ? 3 : 2;
  const fileCount = Math.max(1, Math.floor((innerHeight - 6) / fileHeight));
  const detailHeight = Math.max(1, innerHeight - 8);
  const fileContentWidth = Math.max(1, filesWidth - 4);
  const contentWidth = Math.max(1, rightWidth - 4);
  const detailRows = useMemo(
    () => modelDetailRows(model, details, contentWidth, detailTab),
    [model, details, contentWidth, detailTab],
  );
  const maxOffset = Math.max(0, detailRows.length - detailHeight);
  const scrollOffset = Math.min(offset, maxOffset);
  const resultStart = Math.max(0, modelIndex - listCount + 1);
  const fileStart = Math.max(0, fileIndex - fileCount + 1);
  const selectedFile = files[fileIndex];

  function changeDetailTab(direction) {
    setDetailTab(
      (current) =>
        detailTabs[
          (detailTabs.indexOf(current) + direction + detailTabs.length) % detailTabs.length
        ],
    );
    setOffset(0);
  }

  useEffect(() => {
    setModelIndex(0);
    setFileIndex(0);
    setOffset(0);
    if (downloads.length) setFocus("results");
  }, [downloads]);

  useEffect(() => {
    setFileIndex(0);
    setOffset(0);
    if (!model) return;
    const id = model.name;
    if (cache.current.has(id)) {
      setDetailState({ id, data: cache.current.get(id) });
      return;
    }
    const controller = new AbortController();
    setDetailState({ id, loading: true });
    const timer = setTimeout(async () => {
      try {
        const data = await getHuggingFaceModelDetails(id, { signal: controller.signal });
        if (controller.signal.aborted) return;
        cache.current.set(id, data);
        setDetailState({ id, data });
      } catch (error) {
        if (!controller.signal.aborted) setDetailState({ id, error: error.message });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [model?.name]);

  useInput(
    (input, key) => {
      if (key.escape) return focus === "search" ? onClose() : setFocus("search");
      if (key.tab) {
        const direction = key.shift ? -1 : 1;
        return setFocus(panes[(panes.indexOf(focus) + direction + panes.length) % panes.length]);
      }
      if (key.ctrl && input === "f") return setFocus("search");
      if (focus === "search") {
        if (key.return && searchText.trim() && !downloading) {
          onSearch(searchText.trim());
          setFocus("results");
        } else if (key.downArrow) setFocus("results");
        else if (key.leftArrow) setSearchCursor(previousTextPosition(searchText, searchCursor));
        else if (key.rightArrow) setSearchCursor(nextTextPosition(searchText, searchCursor));
        else if (key.home) setSearchCursor(0);
        else if (key.end) setSearchCursor(searchText.length);
        else if (key.backspace && searchCursor > 0) {
          const previous = previousTextPosition(searchText, searchCursor);
          setSearchText((text) => text.slice(0, previous) + text.slice(searchCursor));
          setSearchCursor(previous);
        } else if (key.delete) {
          setSearchText(
            (text) =>
              text.slice(0, searchCursor) + text.slice(nextTextPosition(searchText, searchCursor)),
          );
        } else if (
          input &&
          !key.ctrl &&
          !key.meta &&
          !key.return &&
          !key.upArrow &&
          !key.leftArrow &&
          !key.rightArrow
        ) {
          const inserted = clean(input.replace(/\r\n?|\n/g, " "));
          setSearchText(
            (text) => text.slice(0, searchCursor) + inserted + text.slice(searchCursor),
          );
          setSearchCursor((cursor) => cursor + inserted.length);
        }
        return;
      }
      if (focus === "results") {
        if (key.upArrow) setModelIndex((index) => Math.max(0, index - 1));
        if (key.downArrow)
          setModelIndex((index) => Math.min(Math.max(0, downloads.length - 1), index + 1));
        if ((key.return || key.rightArrow) && model) setFocus("files");
        if (input === "/") setFocus("search");
      } else if (focus === "files") {
        if (key.upArrow) setFileIndex((index) => Math.max(0, index - 1));
        if (key.downArrow)
          setFileIndex((index) => Math.min(Math.max(0, files.length - 1), index + 1));
        if (key.leftArrow) setFocus("results");
        if (key.rightArrow && model) setFocus("details");
        if (key.pageUp) setFileIndex((index) => Math.max(0, index - fileCount));
        if (key.pageDown)
          setFileIndex((index) => Math.min(Math.max(0, files.length - 1), index + fileCount));
        if (key.home) setFileIndex(0);
        if (key.end) setFileIndex(Math.max(0, files.length - 1));
        if (key.return && files[fileIndex] && !downloading)
          onDownloadSelected(files[fileIndex].uri, files[fileIndex].fileName);
      } else if (focus === "details") {
        if (key.leftArrow || key.rightArrow) return changeDetailTab(key.rightArrow ? 1 : -1);
        const step = key.pageDown
          ? detailHeight
          : key.pageUp
            ? -detailHeight
            : key.downArrow
              ? 1
              : key.upArrow
                ? -1
                : 0;
        if (step) setOffset(Math.max(0, Math.min(maxOffset, scrollOffset + step)));
        if (key.home) setOffset(0);
        if (key.end) setOffset(maxOffset);
      }
    },
    { isActive: !downloading },
  );

  const percentage = Math.max(0, Math.min(100, Math.floor(progress * 100)));
  const filled = Math.round(percentage / 10);
  const status =
    error ||
    (downloading
      ? `Downloading ${percentage}% ${"━".repeat(filled)}${"─".repeat(10 - filled)} · ${clean(downloading.split("/").at(-1))}`
      : progress >= 1
        ? "Download complete."
        : searching
          ? "Searching Hugging Face…"
          : downloadNotice ||
            `${downloads.length} results${searchQuery ? ` for ${clean(searchQuery)}` : ""}`);

  return (
    <Box
      width={width}
      height={height}
      paddingX={2}
      paddingY={1}
      flexDirection="column"
      backgroundColor={colors.background}
      overflow="hidden"
    >
      <Box height={3} flexShrink={0} paddingX={2} paddingY={1} justifyContent="space-between">
        <Text bold color={colors.accent}>
          DOWNLOAD A MODEL
        </Text>
        <Text color={colors.muted}>{narrow ? "GGUF" : "Hugging Face / GGUF models"}</Text>
      </Box>
      <Box
        height={3}
        flexShrink={0}
        borderStyle="round"
        borderBackgroundColor={colors.background}
        borderColor={focus === "search" ? colors.accent : colors.border}
        paddingX={1}
      >
        <Box flexShrink={0}>
          <Text color={colors.label}>Search Hugging Face </Text>
        </Box>
        <Box flexGrow={1} flexBasis={0}>
          <ControlledMultilineInput
            value={searchText}
            cursorIndex={searchCursor}
            rows={1}
            maxRows={1}
            focus={focus === "search" && !downloading}
            showCursor={focus === "search" && !downloading}
            placeholder="Search by model, family or publisher…"
            textStyle={{ color: colors.text }}
          />
        </Box>
      </Box>
      <Box height={bodyHeight} flexShrink={0}>
        {showLeft && (
          <Box
            width={leftWidth}
            height={bodyHeight}
            flexDirection="column"
            paddingX={1}
            borderStyle="round"
            borderBackgroundColor={colors.background}
            borderColor={focus === "results" ? colors.accent : colors.border}
            overflow="hidden"
          >
            <Box height={1} flexShrink={0} justifyContent="space-between">
              <Text bold color={focus === "results" ? colors.accent : colors.label}>
                RESULTS
              </Text>
              <Text color={colors.muted}>
                {downloads.length ? `${modelIndex + 1} / ${downloads.length}` : "GGUF"}
              </Text>
            </Box>
            {!downloads.length && (
              <Box flexDirection="column" marginTop={1} paddingX={1}>
                <Text bold color={colors.text}>
                  {searching
                    ? "Finding models…"
                    : searchQuery
                      ? "No matching models"
                      : "Find your next model"}
                </Text>
                <Text color={colors.muted}>
                  {searching
                    ? "Searching Hugging Face for GGUF files."
                    : searchQuery
                      ? "Try a different model name or publisher."
                      : "Type search, then press Enter. Select a result to explore its specifications and downloads."}
                </Text>
              </Box>
            )}
            {downloads.slice(resultStart, resultStart + listCount).map((item, index) => {
              const selected = resultStart + index === modelIndex;
              return (
                <Box
                  key={item.name}
                  height={resultHeight}
                  flexShrink={0}
                  flexDirection="column"
                  backgroundColor={selected ? colors.selected : undefined}
                >
                  <Text
                    bold={selected}
                    color={selected ? colors.selectedText : colors.text}
                    wrap="truncate"
                  >
                    {selected ? "▸" : " "} {clean(item.title ?? item.name.split("/").at(-1))}
                  </Text>
                  <Text color={selected ? colors.selectedText : colors.muted} wrap="truncate">
                    {" "}
                    {clean(item.publisher ?? item.name.split("/")[0])}
                  </Text>
                  <Text color={selected ? colors.selectedText : colors.muted} wrap="truncate">
                    {" "}
                    {item.parameters ? `~${item.parameters} · ` : ""}
                    {item.files.length} {item.files.length === 1 ? "variant" : "variants"}
                    {Number.isFinite(item.downloads)
                      ? ` · ${compactCount(item.downloads)} pulls`
                      : ""}
                  </Text>
                </Box>
              );
            })}
            <Box flexGrow={1} />
            {downloads.length > 0 && (
              <Text color={colors.hint} wrap="truncate">
                ↑↓ browse · Enter quantizations
              </Text>
            )}
          </Box>
        )}
        {showFiles && (
          <Box
            width={filesWidth}
            marginLeft={narrow ? 0 : 1}
            height={bodyHeight}
            flexDirection="column"
            paddingX={1}
            borderStyle="round"
            borderBackgroundColor={colors.background}
            borderColor={focus === "files" ? colors.accent : colors.border}
            overflow="hidden"
          >
            <Box height={1} flexShrink={0} justifyContent="space-between">
              <Text bold color={focus === "files" ? colors.accent : colors.label}>
                QUANTIZATIONS
              </Text>
              <Text color={colors.muted}>
                {files.length ? `${fileIndex + 1}/${files.length}` : ""}
              </Text>
            </Box>
            <Text color={colors.muted} wrap="truncate">
              {model ? clean(model.title ?? model.name) : "Select a model first"}
            </Text>
            <Box
              height={3}
              flexShrink={0}
              borderStyle="single"
              borderTop
              borderBottom
              borderLeft={false}
              borderRight={false}
              borderColor={colors.border}
              borderBackgroundColor={colors.background}
            >
              <Box width={Math.max(1, fileContentWidth - 12)}>
                <Text color={colors.muted}> Type</Text>
              </Box>
              <Box width={12} justifyContent="flex-end">
                <Text color={colors.muted}>File size </Text>
              </Box>
            </Box>
            {!files.length && (
              <Text color={colors.muted}>
                {model
                  ? "No GGUF files available."
                  : "Choose a model to see its available quantizations."}
              </Text>
            )}
            {files.slice(fileStart, fileStart + fileCount).map((file, row) => {
              const index = fileStart + row;
              return (
                <Box
                  key={file.uri ?? file.fileName}
                  height={fileHeight}
                  flexShrink={0}
                  flexDirection="column"
                  backgroundColor={index === fileIndex ? colors.selected : undefined}
                >
                  <Box height={1} flexShrink={0}>
                    <Box width={Math.max(1, fileContentWidth - 12)}>
                      <Text
                        bold={index === fileIndex}
                        wrap="truncate"
                        color={index === fileIndex ? colors.selectedText : colors.text}
                      >
                        {index === fileIndex ? "▸" : " "} {clean(file.quantization)}
                      </Text>
                    </Box>
                    <Box width={12} justifyContent="flex-end">
                      <Text color={index === fileIndex ? colors.selectedText : colors.text}>
                        {formatModelSize(file.size)}{" "}
                      </Text>
                    </Box>
                  </Box>
                  <Text
                    color={index === fileIndex ? colors.selectedText : colors.muted}
                    wrap="truncate"
                  >
                    {" "}
                    {clean(file.fileName)}
                  </Text>
                </Box>
              );
            })}
            <Box flexGrow={1} />
            <Text color={colors.hint} wrap="truncate">
              Enter download · → details
            </Text>
          </Box>
        )}
        {showRight && (
          <Box
            width={rightWidth}
            marginLeft={narrow ? 0 : 1}
            height={bodyHeight}
            flexDirection="column"
            paddingX={1}
            borderStyle="round"
            borderBackgroundColor={colors.background}
            borderColor={focus === "details" ? colors.accent : colors.border}
            overflow="hidden"
          >
            <Box height={1} flexShrink={0} justifyContent="space-between">
              <Text bold color={colors.text} wrap="truncate">
                {clean(model?.title ?? "MODEL DETAILS")}
              </Text>
              <Text color={colors.accent}>{loading ? " …" : ""}</Text>
            </Box>
            <Text color={colors.muted} wrap="truncate">
              {model ? clean(model.name) : "Select a search result to get started"}
            </Text>
            <Text color={colors.muted} wrap="truncate">
              {selectedFile ? `File: ${clean(selectedFile.fileName)}` : "No quantization selected"}
            </Text>
            <Box
              height={3}
              marginTop={1}
              flexShrink={0}
              borderStyle="double"
              borderTop={false}
              borderLeft={false}
              borderRight={false}
              borderBottom
              borderColor={colors.border}
              borderBackgroundColor={colors.background}
            >
              {detailTabs.map((tab) => (
                <Box
                  key={tab}
                  paddingX={contentWidth >= 38 ? 2 : 1}
                  paddingTop={1}
                  backgroundColor={tab === detailTab ? colors.selected : undefined}
                >
                  <Text
                    bold={tab === detailTab}
                    color={tab === detailTab ? colors.selectedText : colors.muted}
                  >
                    {tab}
                  </Text>
                </Box>
              ))}
            </Box>
            <Box height={detailHeight} flexShrink={0} flexDirection="column" overflow="hidden">
              {detailRows.slice(scrollOffset, scrollOffset + detailHeight).map((row, index) => (
                <Box
                  key={index}
                  height={1}
                  flexShrink={0}
                  backgroundColor={row.kind === "code" ? colors.background : undefined}
                >
                  {row.kind === "field" && row.labelWidth > 0 && (
                    <Box width={row.labelWidth + 2} flexShrink={0}>
                      <Text color={colors.muted}>{row.label}</Text>
                    </Box>
                  )}
                  <Text
                    wrap="truncate"
                    bold={row.kind === "heading" || row.kind === "table-heading"}
                    color={
                      row.kind === "heading" || row.kind === "table-heading"
                        ? colors.label
                        : row.kind === "muted"
                          ? colors.muted
                          : row.text === "Not provided"
                            ? colors.muted
                            : colors.text
                    }
                  >
                    {row.text || " "}
                  </Text>
                </Box>
              ))}
            </Box>
            <Text color={colors.muted} wrap="truncate">
              {loading
                ? "Loading model details…"
                : detailError
                  ? `Details unavailable: ${clean(detailError)}`
                  : `${Math.min(100, Math.round(((scrollOffset + detailHeight) / detailRows.length) * 100))}% · ${focus === "details" ? "←→ tabs · ↑↓ scroll" : "Tab to explore details"}`}
            </Text>
          </Box>
        )}
      </Box>
      <Text
        color={
          error
            ? colors.error
            : downloading
              ? colors.warning
              : progress >= 1
                ? colors.green
                : colors.muted
        }
        wrap="truncate"
      >
        {" "}
        {clean(status)}
      </Text>
      <Text color={colors.hint} wrap="truncate">
        {" "}
        {downloading
          ? canceling
            ? "Stopping download and cleaning up partial files…"
            : "Enter / Esc / C cancel download"
          : focus === "search"
            ? "Enter search · ↓ results"
            : focus === "results"
              ? "↑↓ model · Enter quantizations"
              : focus === "files"
                ? "↑↓ file · Enter download"
                : "←→ section · ↑↓ scroll · PgUp/PgDn"}
      </Text>
      <Text color={colors.hint} wrap="truncate">
        {" "}
        {downloading
          ? "The browser will resume after the download or cleanup finishes."
          : `Tab / Shift+Tab switch pane · Ctrl+F search · Esc ${focus === "search" ? "close" : "search"}`}
      </Text>
      {downloading && (
        <Box position="absolute" top={0} left={0} width={width} height={height}>
          <DownloadProgressDialog
            width={width}
            height={height}
            fileName={downloadFileName || downloading.split("/").at(-1)}
            progress={progress}
            totalSize={totalSize}
            downloadedSize={downloadedSize}
            canceling={canceling}
            onCancel={onCancelDownload}
          />
        </Box>
      )}
    </Box>
  );
}
