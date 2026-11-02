# Parallel session orchestration

**Type:** `proposal`
**Status:** `deferred`

## Motivation

Xarab currently runs as a single interactive instance with one active conversation. A future orchestration mode could let multiple sessions make progress concurrently within one Xarab process, while the user switches between them and monitors their status. This is an alternative to launching independent terminal instances: one process can coordinate session state and shared model resources.

This is a design proposal, not a commitment to a particular UI, concurrency model, or shared inference architecture. Multiple sessions do not necessarily imply simultaneous model inference; a scheduler may queue work according to provider and resource limits.

## Prerequisite: general-purpose task agent

Before orchestration, develop a general-purpose task agent with a clear, bounded interface for tasks that are not the main coding worker's conversation. Candidate uses include:

- Proposing session titles from task context.
- Assessing whether a requested command appears safe to run and explaining the basis for that assessment.
- Other bounded, advisory tasks that benefit from model reasoning without taking over the main worker's responsibilities.

The agent's contract, model/provider selection, input limits, error behavior, and lifecycle need separate design. Keep advisory decisions distinct from authorization: an agent's safety assessment must not by itself approve or execute a command. Existing approval and tool-safety rules remain authoritative. Title generation should be optional and must not overwrite a user-provided title.

The utility and isolated-agentic execution design and initial implementation are recorded in [General-purpose task runner](./general-purpose-task-runner.md).

## Direction to explore

Keep multiple sessions in one process, with each session retaining independent conversation history and execution state. A session should be able to run in the background while the user views another session. The application should expose whether each session is ready, running, waiting for input or approval, completed, failed, or interrupted.

Separate session-owned state from application-wide resources. Potential shared resources include configuration, model runtimes, inference queues, and scheduling. A shared local inference service or runtime could avoid loading duplicate local model weights, but sharing weights does not automatically make contexts or inference safe to use concurrently. Measure memory and throughput before selecting a policy; options include serializing requests, sharing a model with isolated contexts, or limiting active local workers.

Local worker execution is more complex to share than classification: worker runs stream output and invoke tools whose handlers and workspace permissions belong to the session. Preserve that ownership boundary. Do not let a shared model service gain unrestricted access to session workspaces merely to reuse inference.

## Required properties

- **Session isolation:** Conversation history, drafts, pending questions, tool results, and cancellation belong to the correct session; no session's prompt or output leaks into another.
- **Independent control:** Stop, interrupt, or answer a question for one session without affecting other sessions.
- **Scheduling and limits:** Define queueing, fairness, per-provider concurrency, local memory limits, and behavior when a model is unavailable or busy.
- **Persistence and recovery:** Save concurrent session changes without lost updates. Define what shutdown, process crash, or restart does to active work and how interrupted sessions are restored.
- **Shared-resource lifecycle:** Define model load/unload policy, configuration changes during active work, and cleanup when no session needs a resource.
- **Tool safety:** Keep command execution, approvals, and workspace access attributable to the initiating session. A safety classifier can advise but cannot replace explicit authorization requirements.
- **Workspace conflicts:** Parallel agents can still make incompatible edits or run conflicting commands when pointed at the same project. Provide clear workspace visibility; consider separate Git worktrees for independent coding tasks. Do not imply that process-level session isolation prevents file conflicts.
- **Failure containment:** Surface per-session errors and cancellation; define whether a failed worker or runtime can be restarted without terminating unrelated sessions.

## Open questions

- Should the first milestone support multiple background sessions, or only multiple saved sessions with one active run?
- Which operations may run concurrently for remote and local providers? Should local inference begin as a single shared queue?
- Should local classifiers and local workers share one runtime, or should their lifecycles and resource budgets remain separate?
- How should the UI show progress, pending approvals/questions, failures, and resource contention while another session is selected?
- What is the task agent's API and trust boundary? Which tasks are advisory, and which require user confirmation regardless of its result?
- Should a later version allow multiple terminal clients to attach to one orchestrator, or is this strictly a single-UI feature?
- What shutdown policy applies to background work, and how are active turns resumed or marked interrupted after restart?

## Suggested investigation sequence

1. Specify and test the general-purpose task agent independently, including bounded inputs, failure handling, and advisory-versus-authorization semantics.
2. Map state currently tied to the single active controller and identify state that must move into per-session execution contexts.
3. Prototype a scheduler with explicit cancellation and resource limits; verify session state cannot cross-contaminate.
4. Evaluate local model memory, contexts, concurrency, and teardown with measurements before deciding whether to serialize inference or introduce a shared service.
5. Add concurrent persistence/recovery and workspace-conflict UX before enabling unattended background execution.
