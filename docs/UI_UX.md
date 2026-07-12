# UI/UX Guidelines

## Shared React UI Architecture

- Pages and domain components compose shared primitives; they do not restyle
  native controls independently. Use `AppButton` for buttons, `AppNavLink` for
  application navigation, `AppDrawer` for assistants/drawers,
  `ConfirmationDialog`/`ConfirmSubmitButton` for consequential actions, and the
  shared list components in `list-controls.tsx` for lists.
- Shared primitives own shape, spacing, focus, disabled, busy, dark-mode, and
  feedback behavior. Call sites supply semantic variants (`primary`,
  `secondary`, `danger`, or `ghost`) and domain content, not copied class strings.
- Server components fetch and authorize data. Client components own transient UI
  state such as selection, tabs, drawers, pending controls, and confirmation.
  Server actions own mutations and revalidation. Keep those boundaries explicit.

## Application Shell And Navigation

- Every user action must acknowledge itself immediately. The shared dashboard
  action-feedback layer reports navigation as `Opening…`, server/form actions as
  `Working…`, setting changes as `Updating…`, and completed route changes as
  `Page ready`. New buttons, links, popovers, and settings controls inherit
  this behavior automatically; use `data-action-feedback-ignore` only for
  decorative controls that do not perform an action.
- Completed work and server notices appear as green bottom-right toasts; errors
  appear as red bottom-right toasts. Do not use browser `alert` or `confirm`.
  Destructive or consequential operations must use the shared in-app
  `ConfirmationDialog` (or `ConfirmSubmitButton` for server-action forms), with
  clear consequences and an explicit cancel choice.
- Navigation additionally starts the shared animated gradient progress bar before
  the route transition and keeps it visible until the destination is ready.
  Use `startNavigationFeedback()` before `router.push`/`router.replace` calls;
  regular Next.js links are detected automatically.
- The clicked navigation link or button itself must carry the animated gradient
  pending state while that route loads. The top-right notification is secondary
  acknowledgement, not the only navigation-loading signal.

- Use a Material 3-inspired visual language: tonal surfaces, rounded containers,
  restrained elevation, clear focus rings, and touch targets of at least 44 px.
- The main sidebar uses drill-in navigation, not nested dropdown accordions. Its
  root level shows standalone destinations and handling sections. Selecting a
  handling section replaces the sidebar list with only that section's entries and
  a compact link back to `Overview`.
- Every non-overview dashboard page shows a top-left breadcrumb using real links:
  `Overview / Handling section / Current page`. Do not add a second page-specific
  back link when the shared breadcrumb already represents that path.
- In a drill-in sidebar, keep the handling-section name compact and subordinate to
  the navigation rows. Do not add generic labels such as `SECTION`; destination
  rows should be the strongest elements and use filled hover/active surfaces.
- Navigation destinations must use Next.js `Link` elements. Buttons are reserved
  for changing local UI state, such as entering a navigation section or opening a
  settings panel.
- Keep appearance controls in a clearly labelled `Settings` menu near the bottom
  of the application shell. Offer System, Light, and Dark modes explicitly; leave
  room in this menu for future user preferences.
- Navigation and settings must remain usable at mobile widths. The sidebar becomes
  a modal drawer with a visible menu trigger and dismissible backdrop.
- Shared shell behavior belongs in `dashboard-shell.tsx`, `sidebar-nav.tsx`, and
  shared components. Do not create page-specific sidebars or theme controls.

## Dashboard Visuals

- Dashboard charts must use theme-aware colors derived from `resolvedTheme`, not
  the configured `theme` value, because `theme="system"` can resolve to dark mode.
- Charts need a legible zero-data state; never leave an empty plotting rectangle
  that looks broken. Preserve axes for context and overlay a short explanation.
- Prefer restrained area/line charts for short operational trends, with subtle
  grid lines, units on numeric axes, rounded tooltips, and accessible contrast in
  both light and dark themes.

## Lists And Search

The shared list framework in `apps/web/components/list-controls.tsx` is the
contract for every operational list, including tables, record selectors, and
side panels. Define columns once, declare `selectionMode` (`"multi"` or
`"single"`), and expose actions through `ListCommandToolbar` rather than
duplicating row-specific controls. Use `ListSurface` for bordered table
surfaces and `ListSidePanel` for persistent selectors. Rows must be selectable
from any non-control area of the row and expose `aria-selected`; keyboard
Enter/Space should perform the same selection. A list marked non-editable may
still use the same search, sorting, and selection primitives without exposing
edit commands.

List pages and list sections must use one consistent search pattern.

- Use `useListControls`, `SortButton`, and `ListSearchPanel` from `apps/web/components/list-controls.tsx` for sortable/searchable tables.
- `ListSearchPanel` shows one always-visible LOV select for every column with an
  accessor. Omitting the accessor is the explicit way to make a list attribute
  non-searchable. Do not use a Google-style general text box for ordinary list
  filtering. Advanced query syntax stays hidden in a separate `Advanced`
  disclosure until explicitly selected.
- Advanced/search dialogs inside table surfaces must use fixed viewport positioning,
  a viewport-based maximum height, and their own vertical scrolling. Never position
  them inside an `overflow-x-auto` list container where they will be clipped. Use
  the native Popover API for light-dismiss behavior when the dialog is opened from
  a list Search button.
- Keep the search surface collapsed by default. LOV selections are drafts until
  the user selects the explicit `Search` action; only then update the visible rows.
- Editable lists use a selection toolbar above the list. Multi-select lists show a
  leading checkbox column and top-level Edit plus domain actions such as Deactivate
  and Reactivate; do not repeat text actions on every row. Edit requires exactly
  one selected record, while compatible state actions may apply to many records.
- A list explicitly configured with `selectionMode: "single"` omits the checkbox
  column and bulk toolbar; it exposes the edit action only for its selected/current
  row. Multi-select is the default for editable operational lists.
- When two or more related lists belong to the same work surface, use
  `TabbedListSurface` with a top `tablist` instead of stacking full tables. Each
  tab retains its own list search, selection, and actions; arrow keys plus
  Home/End must navigate the tab bar.
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
- Dashboard content is top-left oriented and fills the available viewport width;
  do not center it inside a fixed maximum-width wrapper. Responsive grids should
  add usable columns as space grows while preserving `minmax(0, 1fr)` for dense
  operational tables.
- Persistent selector/record side panels use the page padding as their outer
  breathing room, float with rounded corners and subtle elevation, and stretch
  through the available viewport height on desktop without touching the bottom.
  Their header stays fixed within the panel and only the list body scrolls.
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
