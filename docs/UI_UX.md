# UI/UX Guidelines

## Lists And Search

List pages and list sections must use one consistent search pattern.

- Use `useListControls`, `SortButton`, and `ListSearchPanel` from `apps/web/components/list-controls.tsx` for sortable/searchable tables.
- Do not add inline filter rows inside `<thead>`. Put the top-right `Search` button/panel above the table inside the same bordered table surface.
- The search panel must expose all meaningful list columns, including dates and numeric columns. Use `searchInput: "date"` for date columns and `"number"` for numeric columns when useful.
- Keep advanced search enabled through `ListSearchPanel`; do not build one-off query boxes per page.
- Wrap table surfaces as an outer bordered `overflow-hidden` container, then put the actual table in an inner `overflow-x-auto` container when horizontal scrolling is needed.
- Searchable list labels should match the visible table headers so users can move between column search and table scanning without translation.

## Auction Number Formats

Auction identifiers are similar but not interchangeable.

- **Dispatch no.** uses four digits: `0001`, `0004`, `0123`.
- **Invoice no.** and **lot no.** use four digits when numeric: `0951`, `0058`.
- **Auction sale no. / target sale no.** uses three digits: `019`, `023`.
- Code should use `formatFourDigitNo` only for dispatch, invoice, and lot numbers. Use `formatSaleNo` for `target_sale_no` and sales overview/detail display.
- Multiple brokers can participate in the same auction sale number. Any sale-level overview grouped by sale number must show all participating brokers, not a single overwritten broker.

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
- Do not hardcode operational validation thresholds. Broker/grade min-kg shutout rules live in Auction setup, and should only auto-shutout lots when the rule's apply toggle is enabled.
