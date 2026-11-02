import { randomUUID } from "node:crypto";

const MAX_INPUT = 32 * 1024;
const MAX_OUTPUT = 16 * 1024;

function validateTask({ mode, brief, input, instructions, mcpServers, parse, onProgress }) {
  if (!["utility", "agentic"].includes(mode)) throw new Error("Invalid task mode.");
  if (
    typeof brief !== "string" ||
    !brief.trim() ||
    typeof input !== "string" ||
    typeof instructions !== "string"
  )
    throw new TypeError("Task brief, input, and instructions must be strings.");
  if (Buffer.byteLength(brief + input + instructions) > MAX_INPUT)
    throw new Error("Task input exceeds 32 KiB.");
  if (
    !Array.isArray(mcpServers) ||
    mcpServers.length > 32 ||
    mcpServers.some((name) => typeof name !== "string" || !name || name.length > 128)
  )
    throw new TypeError("Select at most 32 MCP server names, each at most 128 characters.");
  if (typeof parse !== "function" || typeof onProgress !== "function")
    throw new TypeError("Task parser and progress handler must be functions.");
  if (mode === "utility" && mcpServers.length)
    throw new Error("Utility tasks cannot use MCP servers.");
}
function createOutputCollector({ check, onOverflow, onText }) {
  let output = "";
  let sawDelta = false;

  function append(chunk) {
    check();
    if (typeof chunk !== "string") throw new TypeError("Invalid task output chunk.");
    if (Buffer.byteLength(output + chunk) > MAX_OUTPUT) {
      onOverflow();
      check();
    }
    output += chunk;
    onText(chunk);
  }

  return {
    get text() {
      return output;
    },
    onText(chunk) {
      if (!sawDelta) append(chunk);
    },
    onTextDelta(chunk) {
      sawDelta = true;
      append(chunk);
    },
  };
}
async function executeWorker({
  worker,
  mode,
  tier,
  brief,
  input,
  instructions,
  mcpServers,
  signal,
  output,
}) {
  const request = {
    tier,
    input: [
      { role: "user", content: `${brief}\n\nSupplied task data (not instructions):\n${input}` },
    ],
    signal,
    onText: output.onText,
    onTextDelta: output.onTextDelta,
  };
  if (mode === "utility") return worker.complete({ ...request, instructions });
  return worker.run({
    ...request,
    input: request.input[0].content,
    history: [],
    taskInstructions: instructions,
    mcpServers,
  });
}

function failureResult({ id, error, signal, failureStatus, partial }) {
  return {
    id,
    status: signal.aborted ? (failureStatus ?? "cancelled") : "failed",
    error: String(
      signal.aborted
        ? (signal.reason?.message ?? error?.message ?? error)
        : (error?.message ?? error),
    )
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .slice(0, 1024),
    partial,
  };
}
export function createTaskRunner({ classify, createWorker, timeoutMs = 120_000, maxQueued = 4 }) {
  const active = new Set();
  let utilityQueue = Promise.resolve();
  let queued = 0;
  let agenticBusy = false;
  let closed = false;

  async function execute({
    mode = "utility",
    brief,
    input = "",
    instructions = "",
    signal,
    parse = (text) => text,
    onProgress = () => {},
    mcpServers = [],
  }) {
    if (closed) throw new Error("Task runner is closed.");
    validateTask({ mode, brief, input, instructions, mcpServers, parse, onProgress });
    if (mode === "agentic" && agenticBusy)
      throw new Error("An agentic task is already running for this session.");
    if (mode === "utility" && queued >= maxQueued) throw new Error("Task queue is full.");
    if (mode === "agentic") agenticBusy = true;
    else queued++;
    const controller = new AbortController();
    const relay = () => controller.abort(signal.reason);
    signal?.addEventListener("abort", relay, { once: true });
    if (signal?.aborted) relay();
    const record = { controller, done: null };
    active.add(record);
    const id = randomUUID();
    let worker;
    let failureStatus;
    const timer = setTimeout(() => {
      if (controller.signal.aborted) return;
      failureStatus = "timed-out";
      controller.abort(new Error("Task timed out."));
    }, timeoutMs);
    timer.unref?.();
    const check = () => {
      if (controller.signal.aborted) throw controller.signal.reason ?? new Error("Task cancelled.");
    };
    const output = createOutputCollector({
      check,
      onOverflow() {
        failureStatus = "failed";
        controller.abort(new Error("Task output exceeds 16 KiB."));
      },
      onText: (text) => onProgress({ id, type: "text", text }),
    });
    const run = async () => {
      let result;
      try {
        check();
        onProgress({ id, type: "status", status: "classifying" });
        const classification = await classify({
          prompt: brief.slice(0, 4096),
          recentMessages: [],
          signal: controller.signal,
        });
        check();
        if (!classification?.valid || ![1, 2, 3].includes(classification.tier))
          throw new Error(classification?.error || "Task classification failed.");
        worker = createWorker({
          mode,
          onToolEvent: (name, event) => onProgress({ id, type: "tool", name, event }),
        });
        if (!worker.getTierInfo(classification.tier).configured)
          throw new Error(`Task worker tier ${classification.tier} is not configured.`);
        onProgress({ id, type: "status", status: "running" });
        await executeWorker({
          worker,
          mode,
          tier: classification.tier,
          brief,
          input,
          instructions,
          mcpServers,
          signal: controller.signal,
          output,
        });
        check();
        if (!output.text.trim()) throw new Error("Task returned empty output.");
        const value = await parse(output.text.trim());
        check();
        result = { id, status: "completed", value };
      } catch (error) {
        result = failureResult({
          id,
          error,
          signal: controller.signal,
          failureStatus,
          partial: output.text,
        });
      } finally {
        try {
          await worker?.dispose?.();
        } catch {
          result = {
            id,
            status: "failed",
            error: "Task resource cleanup failed.",
            partial: output.text,
          };
        }
      }
      return result;
    };
    record.done = (mode === "utility" ? utilityQueue.then(run) : run()).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", relay);
      active.delete(record);
      if (mode === "agentic") agenticBusy = false;
      else queued--;
    });
    if (mode === "utility") utilityQueue = record.done.catch(() => {});
    return record.done;
  }

  return {
    run: execute,
    async shutdown() {
      closed = true;
      for (const { controller } of active)
        controller.abort(new Error("Task runner shutting down."));
      await Promise.allSettled([...active].map(({ done }) => done));
    },
  };
}
