# General-purpose task runner

**Type:** `proposal`
**Status:** `in-progress`

## Goal and scope

Provide a reusable runner for bounded utility tasks and isolated agentic tasks. The first release should include both modes, automatic session titles, and a built-in general-purpose agent. A command-risk assessment and a dedicated read-only review agent are follow-up work; neither is an authorization mechanism or a prerequisite for the first release.

This proposal is not an implementation specification. Resource limits, APIs, definition compatibility, and scheduling details require further design and verification.

## Common execution

Classify a bounded task brief with the existing tier classifier and run the selected tier's configured worker. Do not send the full parent conversation to the classifier. If classification fails or the selected worker is not configured, fail the task explicitly rather than silently switching models. Define how task instructions and permitted input are represented to each provider without treating task data as higher-priority instructions.

Support streamed progress and validated structured results where a task requires them. Bound input, output, queued work, execution time, and retained partial results; propagate cancellation and surface provider errors. Set concrete limits during implementation. Do not assume a separate adapter shares loaded local model weights or a concurrency budget with the main worker; investigate ownership and measure memory and throughput. The current worker's adapter cache and disposal behavior must be made safe for any concurrent use rather than assumed safe.

## Utility tasks and titles

Utility tasks run without tools or MCP access. Their task-specific instructions and explicitly supplied input provide the required information. Automatic title generation is enabled by default and runs in the background on a bounded excerpt of the first user message; users should understand that the configured classifier and worker may be remote providers. Keep the existing first-message title as an immediate fallback.

Apply a generated title only when it still belongs to the intended existing session and has not been superseded by a manual rename or newer request. Validate and normalize it using session title constraints and persist through the normal session path. Failures leave the fallback in place and show a non-blocking warning associated with the correct session. Define cancellation and stale-result behavior for session switching, deletion, and shutdown.

Command-risk assessment may later be another tool-free task. Its output is advisory: it cannot authorize execution or override user consent and application safety requirements. Design its enforcement, failure behavior, and handling of shell semantics separately before integrating it with command execution.

## Agentic tasks

The main coding agent can invoke a task tool with an explicit task brief, selected context, agent profile, and selected MCP servers. Each task has a clean context and profile-specific instructions, without automatically inheriting the parent conversation. Project agent instructions cannot override higher-priority user and application rules or grant additional permissions.

Agentic tasks may use existing permitted tools and explicitly selected MCP servers, but must not receive the agentic-task tool or spawn further subtasks. Enforce this in the registry and policy, not only in instructions. Preserve existing tool and MCP approval requirements; select MCP servers before connecting and retain existing consent behavior. The built-in general-purpose profile is in scope; a dedicated read-only review profile is deferred.

Allow one agentic task at a time per main session initially. Show task status and streaming progress, then return a bounded summary as the task tool result or appropriate session event. Attribute events and results to the initiating task and session. On failure or cancellation, report the status and any safely bounded partial result. Stopping the parent turn cancels its tasks; define what happens to already-started side effects and do not claim cancellation undoes them.

## Agent definitions

Support built-in definitions and project-provided definitions. Their discovery, precedence, format, name validation, size limits, symlink handling, and error reporting remain design decisions. Project definitions provide agent instructions within application policy; they cannot expand permissions by themselves.

A cross-tool standard for subagent definitions was not established by the initial research. OpenCode documents Markdown definitions under `.opencode/agents/`; Claude Code uses `.claude/agents/`; Codex documents TOML files under `.codex/agents/`. The Agent Skills format and `.agents/skills/` are for skills, not necessarily subagent definitions. Decide whether to propose a Xarab convention such as `.agents/agents/`, adopt a documented subset of another tool's format, or support adapters for multiple formats. Do not claim compatibility without testing it.

References: [OpenCode agents](https://opencode.ai/docs/agents), [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), [Codex subagents](https://developers.openai.com/codex/agent-configuration/subagents), [Agent Skills](https://agentskills.io/home).

## Implementation considerations

- Separate per-task state, timeline events, question handling, and tool results from the parent worker's current message while retaining attribution in the parent session.
- Add per-invocation MCP server filtering before connection; preserve consent, cleanup, and cancellation, including failed connection attempts.
- Trace cancellation through provider requests, queued work, questions, tools, MCP connections, and shutdown. The current shell executor has a timeout but no abort-signal interface; define and test process termination and partial side effects.
- Prevent concurrent title and agentic tasks from disposing adapters or models in use. Establish explicit concurrency and local-resource limits, including interaction with the main worker and classifier.
- Validate output rather than trusting model formatting; handle empty, malformed, oversized, interrupted, and failed streams. Avoid logging sensitive prompts and results by default.
- Preserve saved-session compatibility and existing manual titles. Isolate task results from stale sessions and interruptions.

## Initial implementation

The first implementation provides `createTaskRunner().run()` with `utility` (default) and `agentic` modes. Callers supply a brief, input, instructions, optional abort signal and progress callback, and an optional result parser/validator. Agentic calls also select MCP servers. Completed results contain `value`; failed, cancelled, and timed-out results contain an error and bounded partial output. Invalid invocation arguments or unavailable queue capacity reject before execution. Utility mode uses tool-free completion; agentic mode builds a fresh worker without the task tool or tier-adjustment delegation.

Initial limits are 32 KiB combined brief/input/instructions, 16 KiB generated text, a two-minute deadline including queue wait, at most four outstanding utility tasks (serialized), and one agentic task per session. Deadlines propagate an abort signal; adapters and tools must cooperate with cancellation. Tool output and provider context retain their existing limits. Input limits do not imply a bound on the complete agentic transcript accumulated through tool calls. No automatic retries or fallback models are used.

The controller owns one shared local worker adapter, separate from the classifier. Utility tasks and the main worker wait for local capacity. Agentic tasks fail explicitly when it is occupied, avoiding a deadlock when a local parent waits on a local child. Adapter leases cannot dispose the shared runtime; shutdown waits for active work before releasing it. The local worker model remains resident until a local model switch or shutdown. Real-model memory and throughput have not been benchmarked.

### Project profile format

The selected initial convention is `.agents/agents/<name>.md` in the workspace. Only regular Markdown files are discovered, not symlink entries. Names use lowercase letters/digits and hyphens, up to 64 characters. The built-in `general-purpose` name is reserved. Profiles are limited to 64 KiB on disk and remain subject to the smaller combined task-input limit at invocation. Malformed definitions report an error rather than being interpreted as permission configuration.

The initial frontmatter parser deliberately accepts only the following ordered, unquoted fields; it is not a general YAML parser. Permission, model, MCP, and other frontmatter fields are not supported.

```markdown
---
name: investigate
description: Investigate a problem and report findings
---
Investigate the supplied task. Preserve the user's constraints and finish with a concise summary of findings and verification.
```

Profiles provide subordinate agent instructions, not application-policy overrides. They cannot enable recursive tasks, select a model directly, or grant tool/MCP permissions. Discovery is workspace-local; user-level definitions and compatibility adapters are deferred. The task tool defaults to `general-purpose`; callers can select a project profile by name.

Title generation retains the existing fallback, uses a bounded first-message excerpt, and checks session identity and manual-title state before applying a result. Session switches/deletion and shutdown cancel pending title work. Set `automaticTitles` to `false` in the main configuration to disable it. Title failures produce a non-blocking warning; task prompts/results are not logged by this runner. Model-generated titles do not enter the parent conversation as assistant output.

Cancellation now reaches the shell executor. On POSIX it sends termination to the command's process group and escalates after a grace period; on Windows it targets the child process, not a guaranteed full descendant tree. Cancellation is not rollback or sandboxing. Live provider and local-model behavior still require manual validation beyond fake-provider regression tests.

## Suggested sequence and verification

1. Specify task APIs, result schemas, configuration, execution limits, definition discovery, trust boundaries, and lifecycle ownership. Resolve the agent-definition format before implementing it.
2. Build and test task execution, classifier routing, clean contexts, bounded output, cancellation, and concurrency controls with fake providers.
3. Add agentic tool access, selected MCP connections, parent progress and result handling, and the built-in general-purpose profile. Test no-recursion enforcement and permission boundaries.
4. Add background title generation with stale-result, rename, deletion, shutdown, provider-failure, and persistence tests.
5. Test local and remote provider behavior, overlapping work, cancellation during shell execution and MCP setup, resource disposal, malformed output, and session isolation. Run targeted tests, formatting checks, and the full suite when feasible.

Parallel session orchestration remains a separate future proposal: [parallel session orchestration](./parallel-session-orchestration.md).
