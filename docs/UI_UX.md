# UI/UX Guidelines

## Lists And Search

List pages and list sections must use one consistent search pattern.

- Use `useListControls`, `SortButton`, and `ListSearchPanel` from `apps/web/components/list-controls.tsx` for sortable/searchable tables.
- Do not add inline filter rows inside `<thead>`. Put the top-right `Search` button/panel above the table inside the same bordered table surface.
- The search panel must expose all meaningful list columns, including dates and numeric columns. Use `searchInput: "date"` for date columns and `"number"` for numeric columns when useful.
- Keep advanced search enabled through `ListSearchPanel`; do not build one-off query boxes per page.
- Wrap table surfaces as an outer bordered `overflow-hidden` container, then put the actual table in an inner `overflow-x-auto` container when horizontal scrolling is needed.
- Searchable list labels should match the visible table headers so users can move between column search and table scanning without translation.
- Editable operational lists should expose a compact pencil edit button in the list toolbar, not hidden row text links.
- When a list supports bulk correction, add a leading checkbox column with a select-visible checkbox in the header and a clear selected-count label in the toolbar.
- Editable lists should edit in place. When the user selects rows and clicks the toolbar pencil, the selected records become editable inside the table itself and the toolbar switches to `Save` and `Cancel`; do not open a separate edit dialog for ordinary table record edits.
- Empty fields in inline edit mode mean “blank this value” only when the field is naturally optional. Required operational fields should keep their current value visible in the input so accidental blanks are obvious before save. Explicit status changes must run the same server validation as document imports.
- User-blocking validation should appear as a bottom-left toast and must also be enforced in the server action.

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

## Auction Workflow UX

- Dispatch detail stops at `catalogued`. Its state cards should only represent draft, GRN, and catalogued/ACK progress.
- Valued, sold, settled, withdrawn, and re-print are sales-detail lot lifecycle states. Show and edit those on Sales Detail, not as dispatch-level state cards.
- Tea grade setup must support owner-editable aliases, displayed in the grade list beside the canonical code/name. Broker document imports should normalize grade aliases before showing reconciliation rows, so alias-only spelling differences are not presented as operational mismatches.
- Acknowledgement, valuation, and sellers contract uploads belong on Sales Detail, grouped by broker for that sale. Keep them behind a `Document reconciliation` button that opens a side assistant panel; do not leave the full upload workflow inline above the lot list. Do not place document reconciliation actions on Dispatch Detail.
- Document reconciliation should map by auction sale number, broker, and invoice number across all dispatches in that broker/sale group.
- Re-print is a history-preserving lot state. When a lot is marked `re-print`, keep the original lot visible in Sales Detail; when the same invoice is later added to a new dispatch, link the new lot through `reprint_source_lot_id`.
- Sales Detail lot lists must show all sale lots with invoice(s), lot attributes, explicit state, sale-line values when available, and `Re-print count` defaulting to `0`.
- Sales Detail lot lists are the manual correction surface for sale-stage fields. They should be placed above the dispatch-summary list and support multi-select inline edits for status, buyer, price/kg, proceeds, VAT, and guarantee. The inline edit row should also include the editable lot fields shown in the list: invoice(s), lot no., grade, bags, kg/bag, and sample kg; net kg is computed from weights.
- A lot cannot be manually changed to `sold` unless the resulting row has Price/kg, proceeds, and VAT values.
- Once a sale reaches `settled`, Sales Detail invoice/lot editing is locked. Users may still search and inspect the list, but row selection and edit actions should be disabled and the server action must reject stale edit submissions.
- Keep a dispatch-side Re-print Overview list for tracking invoices marked re-print. It should be a searchable list, not a separate re-print detail workflow.
- Re-print Overview is chain-aware: one row per original invoice chain shows every
  re-print sale, eventual sold sale, re-print count, cumulative sample kg,
  remaining kg, actual sold kg, and ordered status history.
- Manual Re-print requires an additional sample-kg input. Sales Detail inline
  editing remains the correction surface for cumulative sample kg, status, and
  eventual buyer/sale values when document analysis is not used.
