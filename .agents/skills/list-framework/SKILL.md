---
name: list-framework
description: Use when creating or changing any record list in Tea Factory Ops. Enforces the shared list-controls framework, list-local creation, and independently configured CRUD commands.
---

# List framework rule

Every record list must use `apps/web/components/list-controls.tsx`; do not build
ad-hoc tables, search bars, action columns, or persistent adjacent create forms.

- Define one `ListDefinition` with `columns`, `selectionMode`, and independent
  `add`, `edit`, and `delete` booleans. Enable only the operations allowed for
  that list and current user; `false` must remove the command entirely.
- Give `ListSurface` an `onCreate` handler to opt into its built-in `+ New`
  action. Pass `canCreate` and `createDisabledReason` from the page's actual
  permission result. The handler toggles `ListCreatePanel` inside that same
  surface. Never duplicate Add/New in `ListCommandToolbar`, a row action, a
  page-level button, or a persistent right-side form.
- Use `ListSurface`, `ListSearchPanel`, `useListControls`, and
  `useListSelection` for searchable/selectable records. Keep ordinary edits
  inline and protect destructive actions with `ConfirmationDialog` or
  `ConfirmSubmitButton`.
- Every CRUD-enabled list must use `useFrameworkListData` with an opaque,
  typed resource request from `apps/web/lib/list-resources.ts`. Add its read
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
- When two or more full lists share one work surface, put the completed list
  surfaces in `TabbedListSurface`/`TabView`; do not stack them vertically.
- Expo screens use the native/headless list-framework adapter, never the DOM
  `FrameworkList`, while preserving the same create, permission, selection,
  mutation, error, and component-local reload contract.
