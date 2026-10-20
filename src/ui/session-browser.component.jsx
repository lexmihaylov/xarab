import React, { useEffect, useMemo, useRef, useState } from "react";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { browserColors as colors } from "./model-browser-theme.js";
import { cleanModelText as clean } from "./model-browser-view.js";
import { Modal } from "./modal.component.jsx";

function PreviewMessage({ message }) {
  if (message.type === "user") {
    return (
      <box paddingX={1} backgroundColor="#263b2f" border borderColor="#56b6c2">
        <text fg="#e6f4ea" selectable>
          {message.message?.trimEnd() || " "}
        </text>
      </box>
    );
  }

  if (message.type === "agent" || message.type === "assistant") {
    return (
      <box flexDirection="column" marginBottom={1}>
        <text fg={colors.text} bold selectable>
          Assistant
        </text>
        <markdown content={message.message ?? ""} selectable />
      </box>
    );
  }

  if (message.type === "shell") {
    return (
      <box flexDirection="column" marginBottom={1} paddingLeft={1}>
        <text fg={colors.warning} bold selectable>
          Shell
        </text>
        <text fg={colors.warning} selectable>
          {message.message ?? ""}
        </text>
      </box>
    );
  }

  const color = message.severity === "error" ? colors.error : colors.muted;
  return (
    <text fg={color} marginBottom={1} selectable>
      {message.message ?? ""}
    </text>
  );
}

export function SessionBrowser({
  sessions = [],
  currentId,
  loading,
  busy,
  error,
  onClose,
  onSelect,
  onNew,
  onDelete,
  onRename,
}) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState(currentId ?? sessions[0]?.id ?? null);
  const [focusArea, setFocusArea] = useState(sessions.length ? "list" : "search");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const listScroll = useRef(null);
  const detailsScroll = useRef(null);
  const { width: terminalWidth } = useTerminalDimensions();
  const contentWidth = Math.max(1, terminalWidth - 4);
  const narrow = contentWidth < 76;
  const filtered = useMemo(
    () => sessions.filter((session) => session.title.toLowerCase().includes(search.toLowerCase())),
    [search, sessions],
  );
  const selected = filtered.find((session) => session.id === selectedId) ?? filtered[0];
  const selectedIndex = Math.max(
    0,
    filtered.findIndex((session) => session.id === selected?.id),
  );

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    listScroll.current?.scrollChildIntoView(`session-${selected?.id}`);
  }, [selected?.id, filtered.length]);

  useEffect(() => {
    detailsScroll.current?.scrollTo(0);
  }, [selected?.id]);

  useEffect(() => {
    if (narrow && focusArea === "details") {
      setFocusArea(filtered.length ? "list" : "search");
    }
  }, [filtered.length, focusArea, narrow]);

  useKeyboard((key) => {
    if (busy) return;
    if (confirmDelete) {
      if (key.name === "return" && selected) {
        key.preventDefault();
        onDelete(selected.id);
        setConfirmDelete(false);
      } else if (key.name === "escape") {
        key.preventDefault();
        setConfirmDelete(false);
      }
      return;
    }
    if (renaming) {
      if (key.name === "escape") {
        key.preventDefault();
        setRenaming(false);
      }
      return;
    }
    if (key.name === "escape") {
      key.preventDefault();
      onClose();
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      setFocusArea((area) => {
        const areas = [
          "search",
          ...(filtered.length ? ["list"] : []),
          ...(!narrow ? ["details"] : []),
        ];
        const index = areas.indexOf(area);
        const nextIndex = key.shift
          ? (index - 1 + areas.length) % areas.length
          : (index + 1) % areas.length;
        return areas[nextIndex];
      });
    }
    if (focusArea === "list") {
      if (key.name === "up") {
        key.preventDefault();
        setSelectedId(filtered[Math.max(0, selectedIndex - 1)]?.id ?? null);
        return;
      }
      if (key.name === "down") {
        key.preventDefault();
        setSelectedId(filtered[Math.min(filtered.length - 1, selectedIndex + 1)]?.id ?? null);
        return;
      }
      if (key.name === "return" && selected) {
        key.preventDefault();
        onSelect(selected.id);
        return;
      }
    }
    if (focusArea === "details") {
      if (key.name === "up") detailsScroll.current?.scrollBy(-1);
      if (key.name === "down") detailsScroll.current?.scrollBy(1);
      if (key.name === "pageup") detailsScroll.current?.scrollBy(-1, "viewport");
      if (key.name === "pagedown") detailsScroll.current?.scrollBy(1, "viewport");
      if (key.name === "home") detailsScroll.current?.scrollTo(0);
      if (key.name === "end") detailsScroll.current?.scrollTo(detailsScroll.current.scrollHeight);
    }
    if (key.ctrl && key.name === "n") {
      key.preventDefault();
      onNew();
    }
    if (key.ctrl && key.name === "d" && selected) {
      key.preventDefault();
      setConfirmDelete(true);
    }
    if (key.ctrl && key.name === "r" && selected) {
      key.preventDefault();
      setRenameValue(selected.title);
      setRenaming(true);
    }
  });

  const restore = () => selected && !busy && onSelect(selected.id);
  const submitRename = () => {
    if (!selected || !renameValue.trim()) return;
    onRename(selected.id, renameValue.trim());
    setRenaming(false);
  };

  return (
    <Modal title="SAVED SESSIONS" fullScreen>
      <box flexDirection="column" flexGrow={1} minHeight={0} gap={1} overflow="hidden">
        <box
          height={4}
          flexShrink={0}
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focusArea === "search" ? colors.accent : colors.border}
          paddingX={1}
        >
          <text fg={colors.label} height={1} flexShrink={0}>
            Search sessions
          </text>
          <input
            value={search}
            focused={focusArea === "search" && !renaming && !confirmDelete}
            onInput={(value) => setSearch(value)}
            onSubmit={restore}
            width="100%"
            minWidth={0}
            flexGrow={1}
          />
        </box>
        <box flexDirection="row" flexGrow={1} minHeight={0} gap={1}>
          <box
            width={narrow ? "100%" : "42%"}
            flexShrink={0}
            flexDirection="column"
            border
            borderStyle="rounded"
            borderColor={focusArea === "list" ? colors.accent : colors.border}
            paddingX={1}
            overflow="hidden"
          >
            <text fg={colors.label} bold>
              SESSIONS · {filtered.length}
            </text>
            {filtered.length ? (
              <scrollbox
                ref={listScroll}
                flexGrow={1}
                flexBasis={0}
                minHeight={0}
                scrollY
                scrollX={false}
                focused={focusArea === "list" && !renaming && !confirmDelete}
                contentOptions={{ flexDirection: "column" }}
              >
                {filtered.map((session, index) => {
                  const isSelected = index === selectedIndex;
                  const textColor = isSelected ? colors.selectedText : colors.text;
                  const metadataColor = isSelected ? colors.selectedText : colors.muted;
                  return (
                    <box
                      key={session.id}
                      id={`session-${session.id}`}
                      width="100%"
                      flexDirection="column"
                      flexShrink={0}
                      backgroundColor={isSelected ? colors.selected : undefined}
                    >
                      <text fg={textColor} bold={isSelected} truncate>
                        {clean(session.title)}
                      </text>
                      <text fg={metadataColor} truncate>
                        {session.updatedAt.slice(0, 16).replace("T", " ")}
                      </text>
                      <text fg={metadataColor} truncate>
                        {session.messageCount} turns{session.interrupted ? " · interrupted" : ""}
                      </text>
                    </box>
                  );
                })}
              </scrollbox>
            ) : (
              <box flexGrow={1} minHeight={0}>
                <text fg={colors.muted}>
                  {loading ? "Loading sessions…" : "No saved sessions in this workspace."}
                </text>
              </box>
            )}
            <text height={1} flexShrink={0} fg={colors.hint} truncate>
              Current workspace only
            </text>
          </box>
          {!narrow && (
            <box
              flexGrow={1}
              minWidth={0}
              flexDirection="column"
              border
              borderStyle="rounded"
              borderColor={focusArea === "details" ? colors.accent : colors.border}
              paddingX={1}
              overflow="hidden"
            >
              <text fg={colors.accent} bold wrapMode="word" flexShrink={0}>
                {clean(selected?.title ?? "SESSION PREVIEW")}
              </text>
              <text fg={colors.muted} wrapMode="word" flexShrink={0}>
                {clean(selected?.workspace ?? "Select a saved session")}
              </text>
              <text fg={colors.muted} truncate flexShrink={0}>
                {selected ? `Updated ${selected.updatedAt.slice(0, 19).replace("T", " ")}` : ""}
              </text>
              <text fg={colors.label} bold marginTop={1} flexShrink={0}>
                RECENT CONVERSATION
              </text>
              <scrollbox
                ref={detailsScroll}
                flexGrow={1}
                flexBasis={0}
                minHeight={0}
                focused={focusArea === "details" && !renaming && !confirmDelete}
                scrollY
                scrollX={false}
                stickyScroll={false}
                stickyStart="bottom"
                contentOptions={{ flexDirection: "column" }}
              >
                {(selected?.preview ?? []).map((message, index) => (
                  <PreviewMessage key={`${message.type}-${index}`} message={message} />
                ))}
              </scrollbox>
              <text fg={colors.hint} truncate flexShrink={0}>
                History restores without rerunning tools.
              </text>
            </box>
          )}
        </box>
        <text fg={error ? colors.error : colors.muted} truncate height={1} flexShrink={0}>
          {busy ? "Restoring session…" : error ? error : loading ? "Loading saved sessions…" : " "}
        </text>
        <text fg={colors.hint} truncate height={1} flexShrink={0}>
          ↑↓ select · Enter restore · Ctrl+D delete · Ctrl+R rename · Ctrl+N new · Tab search · Esc
          back
        </text>
      </box>
      {renaming && (
        <box
          position="absolute"
          top="38%"
          left={4}
          right={4}
          height={5}
          zIndex={2}
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={colors.accent}
          backgroundColor="#202d38"
          paddingX={1}
        >
          <text fg={colors.accent} height={1} truncate>
            Rename {selected?.title}
          </text>
          <input
            value={renameValue}
            focused
            flexShrink={0}
            onChange={setRenameValue}
            onSubmit={submitRename}
          />
          <text fg={colors.hint} height={1} truncate>
            Enter confirm · Esc cancel
          </text>
        </box>
      )}
      {confirmDelete && (
        <box
          position="absolute"
          top="38%"
          left={4}
          right={4}
          height={5}
          zIndex={2}
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={colors.error}
          backgroundColor="#202d38"
          paddingX={1}
        >
          <text fg={colors.error} bold height={1} truncate>
            DELETE {selected?.title}?
          </text>
          <text fg={colors.text} height={1} truncate>
            This permanently removes the saved conversation.
          </text>
          <text fg={colors.hint} height={1} truncate>
            Enter confirm · Esc cancel
          </text>
        </box>
      )}
    </Modal>
  );
}
