import React, { useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { ControlledMultilineInput } from "ink-multiline-input";
import { browserColors as colors } from "../model-browser-theme.js";
import { cleanModelText as clean } from "../model-browser-view.js";
import { previousTextPosition, nextTextPosition } from "../text-cursor.js";
import { buildChatRows, chatViewport } from "../chat-layout.js";
import { ChatPanel } from "./chat-panel.component.jsx";

export function SessionBrowser({
  sessions = [],
  currentId,
  loading,
  busy,
  error,
  width,
  height,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onRename,
}) {
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);
  const [index, setIndex] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingRename, setPendingRename] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameCursor, setRenameCursor] = useState(0);
  const filtered = sessions.filter((record) =>
    record.title.toLowerCase().includes(search.toLowerCase()),
  );
  const selectedIndex = Math.min(index, Math.max(0, filtered.length - 1));
  const selected = filtered[selectedIndex];
  const target = sessions.find((record) => record.id === pendingDelete);
  const renameTarget = sessions.find((record) => record.id === pendingRename);
  const dialogWidth = Math.min(64, Math.max(20, width - 4));
  const dialogLeft = Math.max(0, Math.floor((width - dialogWidth) / 2));
  const dialogTop = Math.max(0, Math.floor((height - 7) / 2));
  const columns = Math.max(1, width - 4);
  const bodyHeight = Math.max(1, height - 8);
  const narrow = columns < 76;
  const listWidth = narrow ? columns : Math.max(28, Math.floor(columns * 0.4));
  const detailWidth = columns - listWidth - 1;
  const count = Math.max(1, Math.floor((bodyHeight - 4) / 3));
  const start = Math.max(0, selectedIndex - count + 1);
  const previewHeight = Math.max(1, bodyHeight - 8);
  const previewWidth = Math.max(1, detailWidth - 4);
  const preview = useMemo(
    () =>
      selected
        ? chatViewport(buildChatRows(selected.preview ?? [], previewWidth), previewHeight)
            .visibleLines
        : [],
    [selected, previewWidth, previewHeight],
  );
  useInput((input, key) => {
    if (busy) return;
    if (pendingDelete) {
      if (key.return) {
        const id = pendingDelete;
        setPendingDelete(null);
        onDelete(id);
        return;
      }
      if (key.escape) setPendingDelete(null);
      return;
    }
    if (pendingRename) {
      if (key.return) {
        const id = pendingRename;
        setPendingRename(null);
        onRename?.(id, renameValue);
        return;
      }
      if (key.escape) {
        setPendingRename(null);
        return;
      }
      if (key.leftArrow) return setRenameCursor(previousTextPosition(renameValue, renameCursor));
      if (key.rightArrow) return setRenameCursor(nextTextPosition(renameValue, renameCursor));
      if (key.home) return setRenameCursor(0);
      if (key.end) return setRenameCursor(renameValue.length);
      if (key.backspace && renameCursor > 0) {
        const previous = previousTextPosition(renameValue, renameCursor);
        setRenameValue(renameValue.slice(0, previous) + renameValue.slice(renameCursor));
        setRenameCursor(previous);
      } else if (key.delete) {
        setRenameValue(
          renameValue.slice(0, renameCursor) +
            renameValue.slice(nextTextPosition(renameValue, renameCursor)),
        );
      } else if (input && !key.ctrl && !key.meta && !key.tab) {
        const inserted = clean(input.replace(/\r\n?|\n/g, " "));
        setRenameValue(
          renameValue.slice(0, renameCursor) + inserted + renameValue.slice(renameCursor),
        );
        setRenameCursor(renameCursor + inserted.length);
      }
      return;
    }
    if (key.escape) return onClose();
    if (key.ctrl && input === "n") return onNew();
    if (key.ctrl && input === "r") {
      if (selected && !loading) {
        setPendingRename(selected.id);
        setRenameValue(selected.title);
        setRenameCursor(selected.title.length);
      }
      return;
    }
    if (key.ctrl && input === "d") {
      if (selected && !loading) setPendingDelete(selected.id);
      return;
    }
    if (key.return) {
      if (selected && !loading) onSelect(selected.id);
      return;
    }
    if (key.upArrow) return setIndex(Math.max(0, selectedIndex - 1));
    if (key.downArrow)
      return setIndex(Math.min(Math.max(0, filtered.length - 1), selectedIndex + 1));
    if (key.leftArrow) return setCursor(previousTextPosition(search, cursor));
    if (key.rightArrow) return setCursor(nextTextPosition(search, cursor));
    if (key.home) return setCursor(0);
    if (key.end) return setCursor(search.length);
    if (key.backspace && cursor > 0) {
      const previous = previousTextPosition(search, cursor);
      setSearch(search.slice(0, previous) + search.slice(cursor));
      setCursor(previous);
      setIndex(0);
    } else if (key.delete) {
      setSearch(search.slice(0, cursor) + search.slice(nextTextPosition(search, cursor)));
      setIndex(0);
    } else if (input && !key.ctrl && !key.meta && !key.tab && !key.pageUp && !key.pageDown) {
      const inserted = clean(input.replace(/\r\n?|\n/g, " "));
      setSearch(search.slice(0, cursor) + inserted + search.slice(cursor));
      setCursor(cursor + inserted.length);
      setIndex(0);
    }
  });
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
      <Text bold color={colors.accent}>
        SAVED SESSIONS
      </Text>
      <Box
        height={3}
        flexShrink={0}
        borderStyle="round"
        borderColor={colors.accent}
        borderBackgroundColor={colors.background}
        paddingX={1}
      >
        <Box flexShrink={0}>
          <Text color={colors.label}>Search </Text>
        </Box>
        <Box flexGrow={1} flexBasis={0}>
          <ControlledMultilineInput
            value={search}
            cursorIndex={cursor}
            rows={1}
            maxRows={1}
            focus={!busy && !pendingDelete && !pendingRename}
            textStyle={{ color: colors.text }}
          />
        </Box>
      </Box>
      <Box height={bodyHeight} flexShrink={0}>
        <Box
          width={listWidth}
          height={bodyHeight}
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.border}
          borderBackgroundColor={colors.background}
          paddingX={1}
          overflow="hidden"
        >
          <Text bold color={colors.label}>
            SESSIONS · {filtered.length}
          </Text>
          {!filtered.length && (
            <Text color={colors.muted}>
              {loading ? "Loading sessions…" : "No saved sessions in this workspace."}
            </Text>
          )}
          {filtered.slice(start, start + count).map((record, row) => (
            <Box
              key={record.id}
              height={3}
              flexShrink={0}
              flexDirection="column"
              backgroundColor={start + row === selectedIndex ? colors.selected : undefined}
            >
              <Text
                bold
                color={start + row === selectedIndex ? colors.selectedText : colors.text}
                wrap="truncate"
              >
                {record.id === currentId ? "●" : " "} {clean(record.title)}
              </Text>
              <Text
                color={start + row === selectedIndex ? colors.selectedText : colors.muted}
                wrap="truncate"
              >
                {" "}
                {record.updatedAt.slice(0, 16).replace("T", " ")}
              </Text>
              <Text
                color={start + row === selectedIndex ? colors.selectedText : colors.muted}
                wrap="truncate"
              >
                {" "}
                {record.messageCount} turns{record.interrupted ? " · interrupted" : ""}
              </Text>
            </Box>
          ))}
          <Box flexGrow={1} />
          <Text color={colors.hint} wrap="truncate">
            Current workspace only
          </Text>
        </Box>
        {!narrow && (
          <Box
            width={detailWidth}
            height={bodyHeight}
            marginLeft={1}
            flexDirection="column"
            borderStyle="round"
            borderColor={colors.border}
            borderBackgroundColor={colors.background}
            paddingX={1}
            overflow="hidden"
          >
            <Text bold color={colors.accent} wrap="truncate">
              {selected ? clean(selected.title) : "SESSION PREVIEW"}
            </Text>
            <Text color={colors.muted} wrap="truncate">
              {clean(selected?.workspace ?? "Select a saved session")}
            </Text>
            <Text color={colors.muted} wrap="truncate">
              {selected ? `Updated ${selected.updatedAt.slice(0, 19).replace("T", " ")}` : ""}
            </Text>
            <Text bold color={colors.label}>
              RECENT CONVERSATION
            </Text>
            <ChatPanel lines={preview} width={previewWidth} height={previewHeight} />
            <Text color={colors.hint} wrap="truncate">
              History restores without rerunning tools.
            </Text>
          </Box>
        )}
      </Box>
      <Text color={error ? colors.error : colors.muted} wrap="truncate">
        {busy
          ? "Restoring session…"
          : error
            ? clean(error)
            : loading
              ? "Loading saved sessions…"
              : "Sessions are saved automatically."}
      </Text>
      <Text color={colors.hint} wrap="truncate">
        ↑↓ select · Enter restore · Ctrl+D delete · Ctrl+R rename · Ctrl+N new · Esc back
      </Text>
      {pendingRename && (
        <Box
          position="absolute"
          top={dialogTop}
          left={dialogLeft}
          width={dialogWidth}
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.accent}
          borderBackgroundColor={colors.background}
          backgroundColor={colors.background}
          paddingX={1}
        >
          <Text bold color={colors.accent}>
            RENAME SESSION
          </Text>
          <Text color={colors.muted}>
            Enter a new name for {renameTarget ? clean(renameTarget.title) : ""}
          </Text>
          <Text color={colors.text}>{renameValue || " "}</Text>
          <Text color={colors.hint}>Enter confirm · Esc cancel</Text>
        </Box>
      )}
      {pendingDelete && (
        <Box
          position="absolute"
          top={dialogTop}
          left={dialogLeft}
          width={dialogWidth}
          flexDirection="column"
          borderStyle="round"
          borderColor={colors.error}
          borderBackgroundColor={colors.background}
          backgroundColor={colors.background}
          paddingX={1}
        >
          <Text bold color={colors.error}>
            DELETE SESSION
          </Text>
          <Text bold color={colors.text} wrap="truncate">
            {target ? clean(target.title) : ""}
          </Text>
          <Text color={colors.muted}>
            This permanently removes the saved conversation and cannot be undone.
          </Text>
          {target?.id === currentId && (
            <Text color={colors.error}>
              This is the active session; a fresh session will start.
            </Text>
          )}
          <Text color={colors.hint}>Enter confirm · Esc cancel</Text>
        </Box>
      )}
    </Box>
  );
}
