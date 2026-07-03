# UI/UX Guidelines

## Detail Pages

Detail pages are operational work surfaces. Keep the user anchored on the record they are editing or reviewing.

- Put the record title, identifying metadata, and current state machine in the header row. The state machine belongs on the top right on desktop and may wrap below the title on narrow screens.
- Lifecycle cards should show useful operational metrics instead of decorative step numbers: issue count, re-print count, sold/total, prompt date, or pending document state.
- Keep field editing inside the main details group. Use a compact edit icon in the group header; avoid detached page-level edit buttons.
- Move dense record metadata into a compact side panel when the main page task is table-heavy. The main column should carry the active work surface; the side panel should carry facts, actions, and owner-only edit controls.
- Avoid navigation for supporting workflows that belong to the current record. Use an in-page side drawer or modal for uploads, confirmations, and secondary tools, then navigate only when a review screen is the next required step.
- Replace text links that trigger a workflow with buttons. A click should produce visible confirmation, such as an opened drawer, dialog, or inline panel, before any file upload or state-changing action.
- Side drawers should be scoped to the current record, show the record identity, and contain the relevant actions only. Do not send the user to a generic overview when the task can be completed in context. Upload drawers should use dense one-line rows where possible: document name/purpose on the left, choose-file and upload buttons on the right.
- Tables on detail pages should show explicit user-facing statuses. Do not collapse meaningful states such as `sold`, `shutout`, `invoiced`, `re-print`, or `missing` into vague labels when the exact state matters operationally.
- Detail tables should surface preventable operational issues at entry time, not only after document reconciliation. For dispatch lots, show immediate warning chips for likely broker/store problems such as below-minimum net weight.
- Draft detail pages should expose one direct confirmation action to the users allowed to enter the draft. After confirmation, only owners should be able to edit or correct the confirmed record.
- If a validation chip uses a temporary system default, show the active default near the record details and in the chip tooltip until a proper settings page exists.
