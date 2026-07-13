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
- Put commands in `ListCommandToolbar`. Add uses its visible `+` action and
  toggles `ListCreatePanel` inside the list surface. Never place create fields
  in a separate right-side panel.
- Use `ListSurface`, `ListSearchPanel`, `useListControls`, and
  `useListSelection` for searchable/selectable records. Keep ordinary edits
  inline and protect destructive actions with `ConfirmationDialog` or
  `ConfirmSubmitButton`.
- A list with no enabled CRUD commands still uses the framework for its
  columns, search, sort, and selection behavior.

