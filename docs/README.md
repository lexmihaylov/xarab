# Documentation inventory

Each document starts with a **Type** tag describing what it records and a **Status** tag describing its lifecycle.

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
| [`cross-prompt-responses-continuation.md`](./cross-prompt-responses-continuation.md) | `proposal` | `deferred` | Reuse incremental Responses continuation across user prompts |

Use `planned`, `deferred`, `in-progress`, and `done` for status values. Add a `fix`-type document when a completed fix needs a durable implementation record; ordinary implementation details belong in code, tests, or release notes.
