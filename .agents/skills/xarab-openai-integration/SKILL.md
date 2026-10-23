---
name: xarab-openai-integration
description: Work on Xarab's Codex OAuth, model listing, Responses streaming, tools, and provider errors.
---

Inspect `src/utils/openai-codex-auth.js`, `src/agent/worker/openai-responses-worker-adapter.js`, and the caller in `src/agent/controller.js` before changing provider behavior. Verify request and response handling against code and relevant documentation; avoid exposing tokens or remote response bodies in errors. Preserve abort behavior, tool-call handling, and WebSocket/HTTP fallback when applicable.

Use `test/openai-codex-auth.test.js` and `test/agent/worker/openai-responses-worker-adapter.test.js` for regression coverage. Run focused tests and `npm run format:check`, then `npm test` when feasible. Follow the user's scope and approval requirements.
