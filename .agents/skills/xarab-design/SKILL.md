---
name: xarab-design
description: Design or review Xarab-specific terminal UI layouts, dialogs, forms, selection states, and keyboard interactions using the application's visual language.
---

# Xarab terminal design

Use this skill when designing, reviewing, or refining Xarab's interface, especially when a new dialog must feel consistent with existing screens. Pair it with `xarab-ui` for implementation and testing workflow. This is a terminal application built with OpenTUI React, not a browser UI: do not assume DOM, CSS, browser accessibility APIs, or web component libraries.

Follow the normal research-first approval workflow. Loading this skill does not authorize edits. Keep presentation changes separate from routing, persistence, and tool authorization changes.

## Inspect before designing

Read the current implementation rather than relying only on this document:

- `src/utils/theme-engine.js`: semantic palette and theme API.
- `src/components/Modal.component.jsx`: modal scrim, title, sizing, dimming, and nested overlay contract.
- `src/components/ModelChooser.component.jsx`: pane hierarchy, highlighted rows, selection and configured states.
- `src/components/SessionBrowser.component.jsx`: search/list/details focus areas, narrow layouts, scrolling, and confirmations.
- `src/components/ProviderConnections.component.jsx`: compact provider selection and actions.
- `src/components/Composer.component.jsx`: textarea integration, draft handling, wrapping, and key bindings.
- `src/App.component.jsx` and `src/agent/controller.js`: focus boundaries, global shortcuts, modal state, and lifecycle.
- Relevant tests under `test/`, including `dialogs.test.js` and `session-browser.test.js`.

Inspect the closest analogue and its state ownership before proposing a layout. Verify OpenTUI APIs locally; do not invent props or keyboard events.

## Observed visual language

These are existing conventions, not a claim that every component is already consistent:

- Restrained slate surfaces, pale blue accents, green labels, and compact supporting text.
- `Modal` owns the terminal-wide overlay and centered uppercase accent title. Its panel deliberately has no extra border or background. Rich dialogs use rounded borders on internal panes instead.
- Large management dialogs use full-screen layouts; smaller interactions can use a bounded panel. Choose based on content, not a universal full-screen rule.
- Focused panes use accent borders; inactive panes use border tokens.
- Selected rows use a selected background and selected-text foreground, often with bold text and a `›` marker. Other rows commonly use `·`.
- Flex layouts, small consistent gaps, and bounded scroll regions support dense terminal content.
- Status and metadata remain visually secondary; errors and warnings use explicit semantic feedback.

### Color roles

Use `getTheme().colors` rather than copying hex values into new UI:

| Token                      | Role                                            |
| -------------------------- | ----------------------------------------------- |
| `background`, `overlay`    | Base surface and modal scrim                    |
| `text`                     | Primary content                                 |
| `accent`                   | Title, active focus, interaction emphasis       |
| `label`                    | Section labels                                  |
| `selected`, `selectedText` | Highlighted selection background and foreground |
| `muted`, `hint`            | Supporting content and shortcut hints           |
| `border`                   | Inactive pane boundaries                        |
| `green`                    | Positive/configured state                       |
| `warning`, `error`         | Caution and failure feedback                    |

Some existing components contain literal colors. Treat those as legacy inconsistencies, not precedent for new literals; do not perform unrelated palette cleanup. Do not use faint hint text for essential questions or validation errors. Color alone must not convey focus, selection, or failure.

## Recommended design standards

The following are standards for new work and reviews, not assertions that every existing screen implements them.

### Hierarchy and composition

1. Start with the shared modal shell where appropriate.
2. Show a concise title, optional purpose/progress line, primary content, then actions and shortcuts.
3. Use labeled internal panes for meaningful groups; avoid a border around every line.
4. Reuse compact spacing from the closest component. Keep padding, gaps, and row density consistent within a screen.
5. Distinguish the current cursor/focus from persisted selection, checked answers, and configured state.
6. Give the next primary action a visible label. Shortcuts supplement discoverable actions; they must not be the only explanation of how to finish.
7. Present validation near its field and explain what is missing rather than merely refusing navigation.

### Keyboard and focus contract

- Define focus areas and their transitions before implementation. Exactly the intended control should receive text input.
- Modal keys must not also trigger the composer, background lists, global scrolling, or unrelated commands. Check all mounted keyboard listeners; `preventDefault` alone is not proof of isolation.
- Use arrow keys for list navigation and visible, consistent shortcuts for actions. Show only shortcuts that actually work in the current state.
- Preserve expected text-editing behavior while an editor owns focus. Do not steal ordinary characters for navigation.
- Keep focus, cursor, and selection valid after filtering, resizing, navigation, or removal.
- Make Escape cancellation explicit. Distinguish back, cancel, and submit; never interpret dismissal as consent.
- If mouse actions are provided, route them through the same validation and state transitions as keyboard actions.

### Multiline forms and questionnaires

- Use a textarea for multiline answers; inspect the composer for the actual OpenTUI integration. A single-line input is not an acceptable substitute when multiline input is required.
- Make newline versus submit bindings explicit and visible. Do not copy composer submission bindings blindly into a form.
- Show question progress and preserve drafts when moving back or forward.
- Render choices as readable rows. A single-choice indicator and a multiple-choice check state should be distinguishable from the navigation cursor.
- Keep custom-answer editing visibly associated with its choice. Provide a clear way to return to choices without losing the draft.
- Make Back, Next, Submit, and Cancel discoverable; adapt available actions to the current question.
- Validate required answers before advancing. Retain entered content on validation failure.
- Await explicit final submission before returning answers to the agent. Return cancellation separately from empty answers; answering a questionnaire does not authorize unrelated work.
- Account for generation abort, shutdown, duplicate requests, and stale responses at the state/controller boundary. Do not put lifecycle responsibilities solely in the visual component.

### Terminal sizing and overflow

- Check wide, narrow, and short terminals. Suggested review sizes are 120×40, 80×24, and 60×18; these are review targets, not existing breakpoints or guaranteed supported minimums.
- Collapse multi-pane layouts when necessary. Keep the active content reachable rather than squeezing every pane into unreadable columns.
- Use bounded vertical scrolling for long lists, questions, and answers. Preserve visible progress and actions where feasible.
- Inspect `minHeight={0}`, `minWidth={0}`, shrink behavior, and scroll ownership in nested flex layouts.
- Avoid horizontal scrolling for ordinary prose. Wrap questions and instructions; truncate only secondary text where losing content is acceptable.
- Let shortcut hints wrap or shorten contextually. Never rely on a single long footer fitting every terminal.
- Verify that the active row remains visible and that Unicode markers do not break alignment. Use display-width-aware handling where needed, not raw string length assumptions.

## Review and verification

Before implementing, present observed facts, the proposed hierarchy/focus model, affected files, risks, and an ordered plan; wait for approval.

After implementation:

- Test keyboard-only navigation, selection, editing, back/forward preservation, submission, cancellation, and focus isolation.
- Review long labels, multiline content, empty lists, validation errors, busy states, and nested confirmations where applicable.
- Test state/controller cleanup separately from rendering.
- Run focused tests and `npm run format:check`; run `npm test` when feasible.
- Inspect terminal frames or perform a manual terminal review when available. Static source inspection does not establish visual correctness.
- Report checks actually run and blockers. If OpenTUI test utilities fail (for example, `act is not a function`), do not claim interactions passed, silently skip coverage, or change dependencies without an approved plan.

A good result feels like another Xarab screen, makes the next action obvious, preserves editing conventions, and stays usable without a mouse.
