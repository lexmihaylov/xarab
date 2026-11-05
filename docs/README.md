# Documentation inventory

Lifecycle records start with a **Type** tag describing what they record and a **Status** tag describing their lifecycle. User guides are listed separately and are exempt from these tags.

## Type tags

- `issue`: a known defect, limitation, or missing behavior
- `proposal`: a suggested improvement that has not been implemented
- `decision`: a chosen direction or settled design constraint
- `fix`: a completed corrective change, retained for reference

## Inventory

| Document | Type | Status | Subject |
| --- | --- | --- | --- |
| [`openai-response-timeout-recovery.md`](./openai-response-timeout-recovery.md) | `issue` | `deferred` | Timeout and retry recovery for stalled OpenAI responses |
| [`responses-websocket-fallback.md`](./responses-websocket-fallback.md) | `issue` | `deferred` | HTTP fallback when a Responses WebSocket continuation is rejected |
| [`tier-adjustment-rejection.md`](./tier-adjustment-rejection.md) | `issue` | `deferred` | Upward tier adjustment may be rejected with a misleading no-suitable-tier message |
| [`cross-prompt-responses-continuation.md`](./cross-prompt-responses-continuation.md) | `proposal` | `deferred` | Reuse incremental Responses continuation across user prompts |
| [`parallel-session-orchestration.md`](./parallel-session-orchestration.md) | `proposal` | `deferred` | Parallel sessions in one Xarab instance and general-purpose task agent prerequisite |
| [`general-purpose-task-runner.md`](./general-purpose-task-runner.md) | `proposal` | `in-progress` | Utility and isolated agentic tasks, routing, and automatic session titles |
| [`command-policy.md`](./command-policy.md) | `decision` | `in-progress` | Workspace command and native file-tool authorization rules |

### User guides

| Document | Subject |
| --- | --- |
| [`agent-skills.md`](./agent-skills.md) | Agent skill discovery and format |
| [`mcp.md`](./mcp.md) | MCP server setup, approval, and security |

Use `planned`, `deferred`, `in-progress`, and `done` for status values. Add a `fix`-type document when a completed fix needs a durable implementation record; ordinary implementation details belong in code, tests, or release notes.
