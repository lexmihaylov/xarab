# OpenAI response timeout recovery

**Type:** `issue`
**Status:** `planned`

The OpenAI response path can remain in a generating state if the provider opens or attempts a stream but no data arrives, or if an active stream stops producing chunks. Add timeout recovery without changing the current behavior yet.

## Proposed behavior

- Add a first-response/header timeout for requests that never begin streaming.
- Add a separate idle/chunk timeout for streams that stop producing data.
- Abort the stalled request and return a distinct, user-visible timeout error.
- Preserve any partial assistant output as incomplete.
- Offer a retry after timeout.
- Automatically retry at most once only when no tool has executed; require manual confirmation after tool execution to avoid repeating side effects.
- Use bounded exponential backoff with jitter for eligible retries.
- Preserve manual cancellation as a separate path from timeout recovery.

## Initial values to evaluate

- First response timeout: 60 seconds
- Stream idle timeout: 90–120 seconds
- Automatic retries: 1 before any output or tool execution
- Retry backoff: 1–2 seconds with jitter

## Areas to inspect

- `src/agent/openai-responses-adapter.js`: request lifecycle, stream reads, abort handling, and error classification
- Controller/session state: transition out of `generating`, preserve partial output, and expose retry behavior
- Tests: no-response timeout, mid-stream stall, manual cancellation, partial output, retry limits, and tool-call safety

## Completion criteria

- A silent OpenAI request cannot leave the UI generating indefinitely.
- A stalled stream is distinguishable from user cancellation and normal provider errors.
- Retry behavior cannot duplicate tool side effects automatically.
- Timeout and retry behavior is covered by automated tests.
