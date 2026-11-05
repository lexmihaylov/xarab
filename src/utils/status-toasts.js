const suppressedStatuses = new Set(["Ready", "Worker generating…", "Classifying…"]);

export function statusToast(status) {
  if (!status || suppressedStatuses.has(status)) return null;
  if (status.endsWith("…")) return { message: status, severity: "info", duration: 0 };
  if (
    status.startsWith("Session saved:") ||
    status === "Session restored" ||
    status === "Session deleted"
  ) {
    return { message: status, severity: "success" };
  }
  return { message: status, severity: "info" };
}

export function replaceStatusToast(toasts, status, id) {
  const remaining = toasts.filter((toast) => toast.source !== "status" || toast.duration !== 0);
  const next = statusToast(status);
  return next ? [...remaining.slice(-2), { ...next, source: "status", id }] : remaining;
}
