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
- Use `EntityList.tabs` when one live entity is partitioned into lanes, and
  `EntityListTabs` when two or more independent full lists share one work
  surface. Do not stack full lists vertically or import `TabbedListSurface`
  directly in application pages.
- Expo screens use `apps/mobile/components/NativeEntityList.tsx`, never the DOM
  `FrameworkList` and never `useFrameworkListController` directly. The native
  adapter preserves the same create, permission, mutation, error, and
  component-local reload contract.
