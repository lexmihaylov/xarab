# Responses WebSocket rejection fallback

**Type:** `issue`
**Status:** `deferred`

When an OpenAI Responses WebSocket connection is established but the server rejects a request—especially a continuation using `previous_response_id`—Xarab currently surfaces the WebSocket error instead of retrying the request over HTTP. This can fail a tool turn even though the existing HTTP Responses flow may work.

The current HTTP fallback only handles WebSocket transport failures before any text has been emitted. Provider rejection events such as `response.failed` and `error` are not treated as fallback conditions.

## Follow-up

- Identify which provider rejections are safe to retry over HTTP.
- Retry using the full accumulated input history.
- Test rejection during a tool continuation.
- Avoid retrying after streamed text has reached the user, to prevent duplicate output.
