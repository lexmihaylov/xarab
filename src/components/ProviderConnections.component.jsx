import React, { useState } from "react";
import { useKeyboard } from "@opentui/react";
import { Modal } from "./Modal.component.jsx";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;

export function ProviderConnections({
  providers = [],
  statuses = {},
  pending,
  busy,
  error,
  feedback,
  onClose,
  onAction,
}) {
  const [index, setIndex] = useState(0);
  const [redirect, setRedirect] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [focusArea, setFocusArea] = useState("list");
  const provider = providers[index];
  const keyProvider = provider?.method === "apiKey";
  const connected =
    statuses[provider?.id]?.startsWith("Connected") ||
    (keyProvider && statuses[provider?.id]?.startsWith("API key saved"));
  const signingIn = pending?.id === provider?.id;
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      onClose();
      return;
    }
    if (key.name === "tab") {
      key.preventDefault();
      setFocusArea((area) => (area === "list" ? "details" : "list"));
      return;
    }
    if (focusArea === "list" && providers.length && (key.name === "up" || key.name === "down")) {
      key.preventDefault();
      setIndex(
        (current) => (current + (key.name === "up" ? -1 : 1) + providers.length) % providers.length,
      );
      setApiKey("");
      setRedirect("");
      return;
    }
    if (busy || !provider) return;
    if (keyProvider) {
      if (focusArea === "details" && key.ctrl && key.name === "d" && connected) {
        key.preventDefault();
        onAction(provider.id, "disconnect");
        setApiKey("");
      }
      return;
    }
    if (key.ctrl || key.meta) return;
    if (focusArea === "list" && key.name === "c" && signingIn) {
      key.preventDefault();
      onAction(provider.id, "copy");
    }
    if (focusArea === "list" && key.name === "d" && connected) {
      key.preventDefault();
      onAction(provider.id, "disconnect");
    }
    if (key.name === "return" && focusArea === "list" && !signingIn && !connected && !keyProvider) {
      key.preventDefault();
      onAction(provider.id, "connect");
    }
  });
  return (
    <Modal title="PROVIDER CONNECTIONS" fullScreen>
      <text fg={colors.muted} height={1} flexShrink={0} truncate>
        Manage provider credentials. Select models in /route after connecting.
      </text>
      <box flexDirection="row" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
        <box
          width="38%"
          minWidth={0}
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focusArea === "list" ? colors.accent : colors.border}
          paddingX={1}
        >
          <text fg={focusArea === "list" ? colors.accent : colors.label} bold>
            01 PROVIDERS
          </text>
          <scrollbox
            flexGrow={1}
            minHeight={0}
            scrollY
            scrollX={false}
            contentOptions={{ flexDirection: "column" }}
          >
            {providers.map((item, position) => (
              <box
                key={item.id}
                backgroundColor={position === index ? colors.selected : undefined}
                paddingX={1}
                flexShrink={0}
              >
                <text
                  fg={position === index ? colors.selectedText : colors.text}
                  bold={position === index}
                  truncate
                >
                  {position === index ? "› " : "· "}
                  {item.name} · {statuses[item.id] || "Checking…"}
                </text>
              </box>
            ))}
          </scrollbox>
          <text fg={colors.hint} height={1} truncate>
            ↑↓ select · Tab details
          </text>
        </box>
        <box
          flexGrow={1}
          minWidth={0}
          flexDirection="column"
          border
          borderStyle="rounded"
          borderColor={focusArea === "details" ? colors.accent : colors.border}
          paddingX={1}
        >
          <text fg={focusArea === "details" ? colors.accent : colors.label} bold>
            02 CONNECTION
          </text>
          {provider && (
            <box flexDirection="column" flexGrow={1} minHeight={0} gap={1} marginTop={1}>
              <text fg={colors.text} bold truncate>
                {provider.name}
              </text>
              <text fg={colors.muted} truncate>
                {statuses[provider.id] || "Checking…"}
              </text>
              {keyProvider ? (
                <>
                  <text fg={colors.hint}>
                    Save an API key locally. Refresh /route to verify model access.
                  </text>
                  <text fg={colors.error}>
                    Key entry is visible in this terminal. Avoid screen sharing.
                  </text>
                  <input
                    value={apiKey}
                    focused={focusArea === "details" && !busy}
                    onInput={setApiKey}
                    onSubmit={() => {
                      if (apiKey.trim()) {
                        onAction(provider.id, "complete", apiKey.trim());
                        setApiKey("");
                      }
                    }}
                    width="100%"
                  />
                  <text fg={colors.hint}>
                    Enter save key · {connected ? "Ctrl+D remove saved key" : "Esc close"}
                  </text>
                </>
              ) : connected ? (
                <text fg={colors.hint}>D disconnect · Esc close</text>
              ) : signingIn ? (
                <>
                  <text fg={colors.text} wrapMode="word">
                    Open the sign-in URL in your browser. Copy the full URL after the localhost
                    redirect, then paste it below.
                  </text>
                  <text fg={colors.hint} wrapMode="word">
                    {pending.url}
                  </text>
                  <text fg={colors.hint}>
                    {pending.copied
                      ? "Sign-in URL copied to clipboard"
                      : "C copy sign-in URL (clipboard unavailable)"}
                  </text>
                  <input
                    value={redirect}
                    focused={focusArea === "details" && !busy}
                    onInput={setRedirect}
                    onSubmit={() => {
                      if (redirect.trim()) onAction(provider.id, "complete", redirect.trim());
                    }}
                    width="100%"
                  />
                  <text fg={colors.hint}>Paste redirect URL · Enter connect</text>
                </>
              ) : (
                <text fg={colors.hint}>Enter connect</text>
              )}
            </box>
          )}
        </box>
      </box>
      <text
        fg={error ? colors.error : feedback ? colors.green : colors.muted}
        height={1}
        flexShrink={0}
        truncate
      >
        {busy ? "Working…" : error || feedback || " "}
      </text>
      <text fg={colors.hint} height={1} flexShrink={0} truncate>
        Tab switch pane · ↑↓ select · Enter connect/save · C copy URL · D disconnect · Ctrl+D remove
        key · Esc close
      </text>
    </Modal>
  );
}
