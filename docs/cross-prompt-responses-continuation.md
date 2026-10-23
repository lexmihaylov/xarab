# Cross-prompt Responses continuation

**Type:** `proposal`
**Status:** `deferred`

The current adapter opens and closes a WebSocket for each worker run. It sends full conversation history at the beginning of every user prompt, then uses `previous_response_id` to send only new tool outputs for further requests within that prompt. Thus, tool-heavy turns benefit from incremental continuation, but later prompts in the same Xarab session do not. The existing within-prompt continuation has shown substantial token reduction; this is a separate optimization for subsequent prompts.

## Potential improvement

Retain a session-scoped WebSocket and continuation checkpoint across prompts. Track each checkpoint's position in the conversation history so a later request can append only unseen conversation items, without computing a diff between entire histories. A model, tier, or request-settings change may invalidate a checkpoint; in that case send the required full history and establish a new baseline. A long-unused checkpoint may also have a large unseen suffix, which is real context the model has not received.

## Constraints to verify

- Keep `store: false`; do not assume `store: true` is necessary.
- Determine whether the Codex endpoint supports cross-prompt continuation and multiple model/tier checkpoints on one session socket with `store: false`.
- Define behavior after reconnects, model switches, and stale or rejected response IDs.
- Preserve HTTP fallback, including the rejection case documented in [`responses-websocket-fallback.md`](./responses-websocket-fallback.md).
