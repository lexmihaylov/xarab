import React, { useEffect } from "react";
import { getTheme } from "../utils/theme-engine.js";

const colors = getTheme().colors;

const severityStyles = {
  info: { marker: "·", color: "#7dd3fc" },
  success: { marker: "✓", color: "#86efac" },
  warning: { marker: "!", color: "#facc15" },
  error: { marker: "×", color: "#f07178" },
};

const defaultDurations = {
  info: 3500,
  success: 3000,
  warning: 5000,
  error: 8000,
};

function Toast({ toast, onDismiss }) {
  useEffect(() => {
    if (toast.duration === 0) return;
    const duration = toast.duration ?? defaultDurations[toast.severity] ?? defaultDurations.info;
    const timer = setTimeout(() => onDismiss(toast.id), duration);
    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, toast.severity, onDismiss]);

  const style = severityStyles[toast.severity] ?? severityStyles.info;
  return (
    <box
      flexDirection="row"
      padding={1}
      backgroundColor={colors.overlay}
      border={["left"]}
      borderStyle="single"
      borderColor={style.color}
      overflow="hidden"
    >
      <text fg={style.color} bold>
        {style.marker}
      </text>
      <text> </text>
      <text fg="#e5e7eb">{toast.message}</text>
    </box>
  );
}

export function ToastNotifications({ toasts, onDismiss }) {
  if (!toasts.length) return null;

  return (
    <box
      position="absolute"
      top={1}
      left="25%"
      width="50%"
      zIndex={20}
      flexDirection="column"
      alignItems="stretch"
      gap={1}
    >
      {toasts.slice(-3).map((toast) => (
        <Toast key={toast.id} toast={toast} onDismiss={onDismiss} />
      ))}
    </box>
  );
}
