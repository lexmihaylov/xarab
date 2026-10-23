---
name: xarab-tool-development
description: Develop or review Xarab worker tools, their registry wiring, safety boundaries, and tests.
---

When working on a worker tool:
1. Inspect `src/agent/worker/tools/` for the closest existing tool and `src/agent/worker/tool-registry.js` for registration and UI result handling.
2. Follow existing workspace path, output-size, event, and error conventions; do not weaken file or command safety boundaries.
3. Update relevant tests under `test/agent/worker/`, including invalid inputs and failure cases.
4. Run the relevant tests, then `npm test` and `npm run format:check` when feasible. Report any checks not run.

Follow the user's requested scope and Xarab's normal approval workflow before making changes.
