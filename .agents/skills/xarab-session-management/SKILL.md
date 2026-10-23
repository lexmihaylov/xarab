---
name: xarab-session-management
description: Work on Xarab session storage, history, restore, interruption, and conversation compaction.
---

Trace session changes through `src/agent/session-controller.js`, `session-store.js`, `session-history.js`, and `controller.js`. For compaction, inspect `session-compactor.js` and `auto-compactor.js` as well. Preserve saved-session compatibility, draft state, and interrupted-turn behavior; do not assume in-memory messages match serialized history.

Inspect `test/session-controller.test.js`, `test/session-store.test.js`, `test/session-compactor.test.js`, and `test/auto-compactor.test.js` for relevant patterns. Add focused regression tests, run targeted tests and `npm run format:check`, then `npm test` when feasible. Follow the user's scope and approval requirements.
