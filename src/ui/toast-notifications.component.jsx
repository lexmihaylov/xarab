import React, { useEffect } from "react";

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

export function ToastNotifications({ toasts, onDismiss }) {
  useEffect(() => {
    const timers = toasts
      .filter((toast) => toast.duration !== 0)
      .map((toast) => {
        const duration =
          toast.duration ?? defaultDurations[toast.severity] ?? defaultDurations.info;
        return setTimeout(() => onDismiss(toast.id), duration);
      });

    return () => timers.forEach(clearTimeout);
  }, [toasts, onDismiss]);

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
      {toasts.slice(-3).map((toast) => {
        const style = severityStyles[toast.severity] ?? severityStyles.info;
        return (
          <box
            key={toast.id}
            flexDirection="row"
            padding={1}
            backgroundColor="#202d38"
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
      })}
    </box>
  );
}
