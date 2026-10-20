import React, { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { getHuggingFaceModelDetails } from "../agent/model-search.js";
import { cleanModelText as clean, compactCount, modelDetailRows } from "./model-browser-view.js";
import { browserColors, dimmedColors } from "./model-browser-theme.js";
import { DownloadProgressDialog } from "./download-progress-dialog.component.jsx";
import { Modal } from "./modal.component.jsx";

const tabs = ["Overview", "Model card", "Metadata"];

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "size unknown";
  const gigabytes = bytes / 1_000_000_000;
  return `${gigabytes < 10 ? gigabytes.toFixed(1) : Math.round(gigabytes)} GB`;
}

function MarqueeText({ text, width, active, fg, bold }) {
  const [offset, setOffset] = useState(0);
  const value = String(text ?? "");
  const available = Math.max(1, width);
  const isLong = value.length > available;

  useEffect(() => {
    setOffset(0);
    if (!isLong || !active) return undefined;
    const timer = setInterval(() => {
      setOffset((current) => (current + 1) % (value.length + 4));
    }, 180);
    return () => clearInterval(timer);
  }, [active, isLong, value, available]);

  let display = value;
  if (isLong) {
    const padded = `${value}    `;
    const start = offset % padded.length;
    const window = padded.slice(start) + padded.slice(0, start);
    display = window.slice(0, available);
  }

  return (
    <text fg={fg} bold={bold} width="100%" truncate>
      {display}
    </text>
  );
}

export function ModelDownloader({
  downloads = [],
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
  onClose,
  onSearch,
  onDownloadSelected,
  onCancelDownload,
}) {
  // Keep the browser visible but subdued while the progress dialog owns input.
  const colors = downloading ? dimmedColors : browserColors;
  const [search, setSearch] = useState(query);
  const [modelIndex, setModelIndex] = useState(0);
  const [fileIndex, setFileIndex] = useState(0);
  const [active, setActive] = useState(0);
  const [detailTab, setDetailTab] = useState("Overview");
  const [detailState, setDetailState] = useState({});
  const resultScroll = useRef(null);
  const fileScroll = useRef(null);
  const detailScroll = useRef(null);
  const cache = useRef(new Map());
  const { width: terminalWidth } = useTerminalDimensions();
  const screenWidth = Math.max(1, terminalWidth - 4);
  const narrow = screenWidth < 76;
  // File names need more room than the details preview. Only add that third
  // pane once every pane can retain a useful reading width.
  const threeColumns = screenWidth >= 132;
  const showResults = !narrow || active === 0 || active === 1;
  const showFiles = threeColumns || (narrow ? active === 2 : active !== 3);
  const showDetails = threeColumns || active === 3;
  // Keep every visible pane the same width. The row gap is included in the
  // calculation so the three bordered sections line up without overflowing.
  const visiblePaneCount = narrow ? 1 : threeColumns ? 3 : 2;
  const paneWidth = Math.max(
    1,
    Math.floor((screenWidth - (visiblePaneCount - 1)) / visiblePaneCount),
  );
  const leftWidth = paneWidth;
  const filesWidth = paneWidth;
  const detailWidth = paneWidth;
  const fileContentWidth = Math.max(1, filesWidth - 5);
  const fileSizeWidth = Math.min(12, Math.max(8, Math.floor(fileContentWidth / 2)));
  const fileNameWidth = Math.max(1, fileContentWidth - fileSizeWidth);
  const model = downloads[modelIndex];
  const details = detailState.id === model?.name ? detailState.data : null;
  const files = details?.files ?? model?.files ?? [];
  const file = files[fileIndex];
  const detailContentWidth = Math.max(1, detailWidth - 5);
  const detailRows = useMemo(
    () => modelDetailRows(model, details, detailContentWidth, detailTab),
    [model, details, detailTab, detailContentWidth],
  );
  useEffect(() => {
    resultScroll.current?.scrollChildIntoView(`download-model-${modelIndex}`);
  }, [modelIndex, downloads, showResults, terminalWidth]);

  useEffect(() => {
    fileScroll.current?.scrollChildIntoView(`download-file-${fileIndex}`);
  }, [fileIndex, files, showFiles, terminalWidth]);

  useEffect(() => {
    detailScroll.current?.scrollTo(0);
  }, [detailTab, model?.name]);

  useEffect(() => {
    setModelIndex(0);
    setFileIndex(0);
  }, [downloads]);

  useEffect(() => {
    setFileIndex(0);
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
        if (!controller.signal.aborted) {
          cache.current.set(id, data);
          setDetailState({ id, data });
        }
      } catch (detailError) {
        if (!controller.signal.aborted) setDetailState({ id, error: detailError.message });
      }
    }, 180);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [model?.name]);

  const submitSearch = () => {
    if (search.trim() && !downloading) {
      onSearch(search.trim());
      setActive(1);
    }
  };

  useKeyboard((key) => {
    if (downloading) {
      if (!canceling && key.name === "escape") {
        key.preventDefault();
        onCancelDownload();
      }
      return;
    }
    if (key.name === "escape") {
      key.preventDefault();
      if (active === 0) onClose();
      else setActive(0);
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      setActive((current) => (current + (key.shift ? 3 : 1)) % 4);
      return;
    }
    if (active === 0) {
      if (key.name === "down") setActive(1);
      return;
    }
    if (active === 1) {
      if (key.name === "up") setModelIndex((index) => Math.max(0, index - 1));
      if (key.name === "down")
        setModelIndex((index) => Math.min(Math.max(0, downloads.length - 1), index + 1));
      if (key.name === "right" || key.name === "return") setActive(2);
      if (key.name === "/") setActive(0);
      return;
    }
    if (active === 2) {
      if (key.name === "up") setFileIndex((index) => Math.max(0, index - 1));
      if (key.name === "down")
        setFileIndex((index) => Math.min(Math.max(0, files.length - 1), index + 1));
      if (key.name === "left") setActive(1);
      if (key.name === "right") setActive(3);
      if (key.name === "return" && file) onDownloadSelected(file.uri, file.fileName);
      return;
    }
    if (key.name === "left" || key.name === "right") {
      setDetailTab((current) => tabs[(tabs.indexOf(current) + (key.name === "right" ? 1 : 2)) % 3]);
    }
    const scroll = detailScroll.current;
    if (key.name === "up") scroll?.scrollBy(-1);
    if (key.name === "down") scroll?.scrollBy(1);
    if (key.name === "pageup") scroll?.scrollBy(-1, "viewport");
    if (key.name === "pagedown") scroll?.scrollBy(1, "viewport");
    if (key.name === "home") scroll?.scrollTo(0);
    if (key.name === "end") scroll?.scrollTo(scroll.scrollHeight);
  });

  const status =
    error ||
    (progress >= 1
      ? "Download complete."
      : searching
        ? "Searching Hugging Face…"
        : downloadNotice ||
          `${downloads.length} results${searchQuery ? ` for ${clean(searchQuery)}` : ""}`);
  return (
    <Modal title="DOWNLOAD A MODEL" fullScreen>
      <box
        height={4}
        flexShrink={0}
        flexDirection="column"
        border
        borderStyle="rounded"
        borderColor={!downloading && active === 0 ? colors.accent : colors.border}
        paddingX={1}
        marginBottom={1}
      >
        <text fg={colors.label} height={1} flexShrink={0}>
          Search Hugging Face
        </text>
        <input
          value={search}
          focused={!downloading && active === 0}
          placeholder="Model, family, or publisher"
          onInput={setSearch}
          onSubmit={submitSearch}
          width="100%"
          minWidth={0}
          flexGrow={1}
        />
      </box>
      <box flexGrow={1} minHeight={0} flexDirection="row" gap={1}>
        {showResults && (
          <box
            width={leftWidth}
            flexShrink={0}
            minHeight={0}
            flexDirection="column"
            border
            borderStyle="rounded"
            borderColor={active === 1 ? colors.accent : colors.border}
            paddingX={1}
            overflow="hidden"
          >
            <box width="100%" minWidth={0} height={1} flexShrink={0} flexDirection="row">
              <text flexGrow={1} minWidth={0} fg={active === 1 ? colors.accent : colors.label} bold>
                Model:
              </text>
              <text flexShrink={0} fg={colors.muted}>
                {downloads.length ? `${modelIndex + 1}/${downloads.length}` : "0/0"}
              </text>
            </box>
            <scrollbox
              ref={resultScroll}
              flexGrow={1}
              flexBasis={0}
              minHeight={0}
              scrollY
              scrollX={false}
              contentOptions={{ flexDirection: "column" }}
            >
              {!downloads.length && (
                <text fg={colors.muted}>
                  {searching
                    ? "Finding models…"
                    : searchQuery
                      ? "No matching models"
                      : "Find your next model"}
                </text>
              )}
              {downloads.map((item, index) => {
                const selected = index === modelIndex;
                return (
                  <box
                    key={item.name}
                    id={`download-model-${index}`}
                    width="100%"
                    flexDirection="column"
                    flexShrink={0}
                    backgroundColor={selected ? colors.selected : undefined}
                  >
                    <MarqueeText
                      text={`${selected ? "▸" : " "} ${clean(item.title ?? item.name.split("/").at(-1))}`}
                      width={Math.max(1, leftWidth - 5)}
                      active={selected}
                      fg={selected ? colors.selectedText : colors.accent}
                      bold
                    />
                    <text
                      fg={selected ? colors.selectedText : colors.label}
                      bold={selected}
                      truncate
                    >
                      {"  "}
                      {clean(item.publisher ?? item.name.split("/")[0])}
                    </text>
                    <text fg={selected ? colors.selectedText : colors.muted} truncate>
                      {"  "}
                      {item.parameters ? `~${item.parameters} · ` : ""}
                      {item.files.length} {item.files.length === 1 ? "variant" : "variants"}
                      {Number.isFinite(item.downloads)
                        ? ` · ${compactCount(item.downloads)} pulls`
                        : ""}
                    </text>
                  </box>
                );
              })}
            </scrollbox>
            <text height={1} flexShrink={0} fg={colors.hint} truncate>
              ↑↓ browse · Enter quantizations
            </text>
          </box>
        )}
        {showFiles && (
          <box
            width={filesWidth}
            flexShrink={0}
            minWidth={0}
            minHeight={0}
            flexDirection="column"
            border
            borderStyle="rounded"
            borderColor={active === 2 ? colors.accent : colors.border}
            paddingX={1}
            overflow="hidden"
          >
            <box width="100%" minWidth={0} height={1} flexShrink={0} flexDirection="row">
              <text flexGrow={1} minWidth={0} fg={active === 2 ? colors.accent : colors.label} bold>
                Quantization:
              </text>
              <text flexShrink={0} fg={colors.muted}>
                {files.length ? `${fileIndex + 1}/${files.length}` : "0/0"}
              </text>
            </box>
            <text height={1} flexShrink={0} fg={colors.muted} truncate>
              {model ? clean(model.title ?? model.name) : "Select a model first"}
            </text>
            <box
              flexDirection="row"
              height={2}
              flexShrink={0}
              border={["bottom"]}
              borderColor={colors.border}
            >
              <text width={fileNameWidth} fg={colors.muted} truncate>
                File name
              </text>
              <box flexDirection="row" width={fileSizeWidth} justifyContent="flex-end">
                <text fg={colors.muted}>File size</text>
              </box>
            </box>
            <scrollbox
              ref={fileScroll}
              flexGrow={1}
              flexBasis={0}
              minHeight={0}
              scrollY
              scrollX={false}
              contentOptions={{ flexDirection: "column" }}
            >
              {files.map((item, index) => {
                const selected = index === fileIndex;
                return (
                  <box
                    key={item.uri ?? item.fileName}
                    id={`download-file-${index}`}
                    flexDirection="row"
                    height={1}
                    width="100%"
                    flexShrink={0}
                    backgroundColor={selected ? colors.selected : undefined}
                  >
                    <text
                      width={fileNameWidth}
                      fg={selected ? colors.selectedText : colors.text}
                      bold={selected}
                      truncate
                    >
                      {clean(item.fileName)}
                    </text>
                    <box flexDirection="row" width={fileSizeWidth} justifyContent="flex-end">
                      <text fg={selected ? colors.selectedText : colors.text} truncate>
                        {formatSize(item.size)}
                      </text>
                    </box>
                  </box>
                );
              })}
              {!files.length && (
                <text fg={colors.muted}>Select a model to view its GGUF files.</text>
              )}
            </scrollbox>
            <text height={1} flexShrink={0} fg={colors.hint} truncate>
              Enter download · → details
            </text>
          </box>
        )}
        {showDetails && (
          <box
            width={detailWidth}
            flexGrow={0}
            flexShrink={0}
            minHeight={0}
            flexDirection="column"
            border
            borderStyle="rounded"
            borderColor={active === 3 ? colors.accent : colors.border}
            paddingX={1}
            overflow="hidden"
          >
            <box flexDirection="row" height={1} flexShrink={0} justifyContent="space-between">
              <text fg={active === 3 ? colors.accent : colors.label} bold truncate>
                {clean(model?.title ?? "MODEL DETAILS")}
              </text>
              <text fg={colors.muted}>{detailState.loading ? "…" : ""}</text>
            </box>
            <text height={1} flexShrink={0} fg={colors.muted} truncate>
              {model ? clean(model.name) : "Select a search result"}
            </text>
            <box flexDirection="row" height={3} flexShrink={0} gap={1} minWidth={0}>
              {tabs.map((tab) => {
                const selected = tab === detailTab;
                return (
                  <box
                    key={tab}
                    flexGrow={1}
                    flexBasis={0}
                    minWidth={0}
                    height={3}
                    flexShrink={0}
                    alignItems="center"
                    justifyContent="center"
                    border
                    borderStyle="rounded"
                    borderColor={selected ? colors.accent : colors.border}
                  >
                    <text fg={selected ? colors.accent : colors.muted} bold={selected} truncate>
                      {tab}
                    </text>
                  </box>
                );
              })}
            </box>
            <scrollbox
              ref={detailScroll}
              flexGrow={1}
              flexBasis={0}
              minHeight={0}
              scrollY
              scrollX={false}
              contentOptions={{ flexDirection: "column" }}
            >
              {detailRows.map((item, index) => (
                <text
                  key={`${index}-${item.text}`}
                  height={1}
                  flexShrink={0}
                  fg={
                    item.kind === "heading" || item.kind === "table-heading"
                      ? colors.label
                      : item.kind === "muted"
                        ? colors.muted
                        : colors.text
                  }
                  truncate
                >
                  {item.label ? `${item.label}: ${item.text}` : item.text || " "}
                </text>
              ))}
            </scrollbox>
            <text fg={detailState.error ? colors.error : colors.hint} truncate>
              {detailState.error
                ? `Details unavailable: ${clean(detailState.error)}`
                : "←→ tabs · ↑↓ scroll · PgUp/PgDn page"}
            </text>
          </box>
        )}
      </box>
      {!downloading && (
        <>
          <text
            fg={error ? colors.error : progress >= 1 ? colors.green : colors.muted}
            height={1}
            flexShrink={0}
            truncate
          >
            {status}
          </text>
          <text fg={colors.hint} height={1} flexShrink={0} truncate>
            Tab switch pane · Enter search/download · Esc close
          </text>
        </>
      )}
      {downloading && (
        <DownloadProgressDialog
          fileName={downloadFileName || downloading.split("/").at(-1)}
          progress={progress}
          totalSize={totalSize}
          downloadedSize={downloadedSize}
          canceling={canceling}
        />
      )}
    </Modal>
  );
}
