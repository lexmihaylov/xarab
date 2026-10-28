---
name: xarab-ui
description: Develop Xarab's OpenTUI React terminal interface, components, keyboard interactions, and UI tests.
---

For visual design, dialog layout, forms, or interaction reviews, also load `xarab-design` for Xarab-specific design conventions and review criteria.

For UI work, inspect `src/App.component.jsx`, the affected `src/components/` files, and the controller/state that supplies their props. Follow existing OpenTUI React patterns; account for terminal width, keyboard focus, loading states, and accessible visible feedback where relevant. Avoid changing routing or persistence behavior solely to solve a presentation issue.

Find corresponding tests under `test/` (for example dialog, session browser, and message tests), add focused coverage for changed interactions, and run relevant tests plus `npm run format:check`; run `npm test` when feasible. Follow the user's scope and Xarab's approval workflow.
