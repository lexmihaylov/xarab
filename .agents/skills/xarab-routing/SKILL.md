---
name: xarab-routing
description: Investigate or change Xarab classifier, tier routing, model assignments, and worker adapters.
---

For routing work, trace the request from `src/agent/controller.js` through `src/agent/classifier/`, `src/agent/worker/`, and the model/configuration code before changing behavior. Distinguish the classifier's tier decision from the worker selected for that tier. Check current behavior and configuration against the implementation rather than relying on README examples alone.

Keep classifier instructions, parsing, provider adapters, and tier assignments consistent. Inspect `test/routing.test.js`, `test/classifier-evaluation.test.js`, and relevant `test/agent/` coverage; add focused tests for changed behavior. Run targeted tests and `npm run format:check`, then the full suite when feasible. Follow the user's scope and Xarab's approval workflow.
