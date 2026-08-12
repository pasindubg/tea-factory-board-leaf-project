---
name: list-framework
description: Use when creating or changing any record list in Tea Factory Ops. Enforces the shared list-controls framework, list-local creation, and independently configured CRUD commands.
---

# List framework rule

Every record list must use `apps/web/components/list-controls.tsx`; do not build
ad-hoc tables, search bars, action columns, or persistent adjacent create forms.

For an ordinary scalar record list, prefer `apps/web/components/entity-list.tsx`.
It is keyed by the same opaque list resource and owns the repeated refresh,
search, selection, toolbar, create-panel, delete-confirmation, and table
wiring. Declare cell display and inline editors in `EntityListColumn`, bulk or
domain actions in `commands`, aggregates in `summary`/`footer`, and same-entity
workflow lanes in `tabs`. Pass domain form content through `create.render` and
keep tenant-scoped server actions explicit.

The `EntityList.render` escape hatch is restricted to genuine multi-record
workflow screens and non-tabular matrices. Ordinary linked-card side panels use
the declarative `sideList` presentation. The render callback receives the shared
controls and selection context; page components must not import
`useListControls`, `useListSelection`, or `useFrameworkListData` directly.

- Define one `ListDefinition` with `columns`, `selectionMode`, and independent
  `add`, `edit`, and `delete` booleans. Enable only the operations allowed for
  that list and current user; `false` must remove the command entirely.
- Give `ListSurface` an `onCreate` handler to opt into its built-in `+ New`
  action. Pass `canCreate` and `createDisabledReason` from the page's actual
  permission result. The handler toggles `ListCreatePanel` inside that same
  surface. Never duplicate Add/New in `ListCommandToolbar`, a row action, a
  page-level button, or a persistent right-side form.
- Keep ordinary edits inline through column `edit` renderers. Protect
  destructive CRUD and domain commands with the declarative delete/command
  confirmation definitions.
- Every CRUD-enabled `EntityList` must receive an opaque, typed resource
  request from `apps/web/lib/list-resources.ts`. Add its read
  model once to the server-only allowlist in `list-resource-registry.ts`; never
  add an entity-specific refresh action or accept a table name, tenant ID,
  arbitrary filters, or arbitrary columns from the browser. The registry must
  authenticate, authorize the module, parse only the resource's declared
  context parameters, and query through the tenant-scoped client.
- A successful mutation returns `ListMutationResult`. The framework reloads
  only the originating mounted list and any explicitly declared dependent
  resource invalidations. Never require a browser reload or call
  `router.refresh()` for ordinary list CRUD.
- A list with no enabled CRUD commands still uses the framework for its
  columns, search, sort, and selection behavior.
- **Every list has two display modes, owned by the framework — pages never
  build their own.** The gear control at the right of the list toolbar chooses
  between them, and the choice is remembered per list scope:
  - **`list` (the default)** fits the viewport. No horizontal scrollbar; only
    the columns that fit are shown, the rest are hidden by a generated
    `nth-child` rule so page-authored create-row cells stay aligned with the
    header.
  - **`table`** shows every column with horizontal scrolling, and each column
    can be dragged wider or narrower from its header edge.
  Both modes use `table-layout: fixed` with single-line cells: a cell never
  wraps, over-long text is clipped with an ellipsis, and the full value is in
  the cell's `title`. This is what keeps a create/edit row exactly one line
  tall no matter how long its content is — never re-introduce `w-full` +
  `auto` layout on a framework table, and never let a cell wrap to "fix"
  crowding. Use `minWidth` on a `ColumnDef` to tune what counts as fitting;
  give dense numeric columns a smaller one so they do not push a more
  important column off screen.
- **A `filter: "select"` column MUST declare `filterOptions`.** The search
  panel renders every such column as a LOV picker showing the whole option set,
  but it can only offer what the column declares — with nothing declared it
  falls back to the values found in the rows currently loaded, so any state
  nobody happens to be in right now silently becomes unsearchable. Build the
  list from the domain's own constant (`LOT_STATES`, `DISPATCH_STATUSES`,
  `BROKER_INVOICE_STATUSES`) through `enumFilterOptions` for raw values, or
  `stateBucketOptions` when the column shows a bucket label — never by hand,
  so the options cannot drift from what the column renders.
- **On a DETAIL page, a record-picking field is `DetailLovField`** (from
  `components/detail-workspace.tsx`), which wraps the same `LovCombobox` a list
  column gets. Detail panels are hand-written markup rather than column
  definitions, so they cannot inherit the picker automatically — declaring the
  field through this component is what makes them behave identically. Pass
  `defaultValue` (the stored id/code) and `defaultLabel` (how it currently
  reads), so an existing record still shows its value even when the source
  would not return it — a deactivated warehouse, for instance. Never put a bare
  `<select>` of records in a detail panel.
- **Declare `lovSource` on the column; do not hand-roll the input.**
  `lovSource` alone wires the column's SEARCH field. Add `lovEdit: true` to
  also get the shared `LovCombobox` as the inline editor, with no `edit`
  renderer — that is how a list inherits the picker without per-list work.
  Only set `lovEdit` when the list's save action actually reads that field:
  a column may legitimately declare a source for search while its value is
  owned by another record (the broker and mark shown against a lot belong to
  its parent broker invoice), and an editor there submits a name nobody
  consumes, so the value is silently dropped. Add `lovName` when the
  submitted field name differs from the column key, and `lovValue` when the
  column displays a label but stores an id. Write an explicit `edit` only when
  the cell needs something the default cannot express (e.g. a per-row
  permission gate) — and put a `LovCombobox` inside it, never a bare `<select>`
  or text input. A create row's cells are custom JSX, so they always name
  `LovCombobox` directly.
- **LOV fields are validated by the database, never by the input.** Any field
  that picks an existing record uses `LovCombobox` with an allowlisted source
  from `lib/list-lov-registry.ts`, and the column it writes MUST be foreign-key
  referenced to the table that owns those values:
  - an id-typed column references that table's primary key as usual;
  - a **code/text** column takes a COMPOSITE key including the tenant —
    `(factory_id, <code>) REFERENCES <owner>(factory_id, code)` — which pins
    the value to the same factory as well as proving it exists. The owner needs
    a unique index on `(factory_id, code)`; Postgres accepts one for the
    reference. `auction_lots.grade` -> `auction_grades` is the reference
    implementation (`fk_auction_lots_grade`).
  Use `ON UPDATE CASCADE` so renaming a code carries into its children, and
  leave `ON DELETE` as NO ACTION so a value in use cannot vanish beneath them.
- Typing a value that does not exist is NOT an error while typing — the
  dropdown just shows "No matches" in place. `LovCombobox` submits the typed
  text as-is; the foreign key rejects the write, and `friendlyError` turns the
  violation into a message naming the offending value ("BOPFX" is not an
  existing tea grade.). To make a NEW referenced table report readably, add its
  singular noun to `REFERENCED_ENTITY_LABELS` in `apps/web/lib/errors.ts` —
  that is the only step; the parsing is generic. Never re-implement this check
  in a page, a server action, or an input handler: duplicating it in app code
  is what lets the two disagree.
- Use `EntityList.tabs` when one live entity is partitioned into lanes, and
  `EntityListTabs` when two or more independent full lists share one work
  surface. Do not stack full lists vertically or import `TabbedListSurface`
  directly in application pages.
- Expo screens use `apps/mobile/components/NativeEntityList.tsx`, never the DOM
  `FrameworkList` and never `useFrameworkListController` directly. The native
  adapter preserves the same create, permission, mutation, error, and
  component-local reload contract.
