# Tea Factory Ops agent rules

These rules apply to the entire repository.

## Mandatory skills

- Read `.agents/skills/tea-factory-ops/SKILL.md` before changing this repository.
- Read `.agents/skills/tenant-secure-crud/SKILL.md` before creating, changing,
  reviewing, or debugging any database read or CRUD action.
- Read `.agents/skills/list-framework/SKILL.md` before changing a record list.
- Read `.agents/skills/supabase/SKILL.md` for every Supabase-related task.

## Golden tenant CRUD policy

Tenant isolation is a release-blocking invariant, not an optional convention.
No CRUD feature is complete unless it satisfies the `tenant-secure-crud` skill
and its verification checklist. Never weaken tenant scoping to make a feature
work, never accept a client-provided tenant/table as authority, and never use the
admin Supabase client for tenant data.

## Golden list framework policy

Every record list must follow `.agents/skills/list-framework/SKILL.md`.
Ordinary lists use the entity-keyed `EntityList` with declarative columns,
inline editing, bulk/domain commands, totals/footers, and tab partitions.
Ordinary linked side panels use `sideList`; `EntityList.render` is reserved for
genuine workflow and matrix layouts and must consume the framework-provided
controls rather than page-level list hooks. Expo screens use
`NativeEntityList`, not the controller hook directly. All paths use the
permission-aware built-in `+ New`, opaque
resource-local refresh, and `EntityListTabs` for independent related lists.
Entity-specific refresh functions, row action columns, page-level duplicate
Add buttons, stacked related lists, and `router.refresh()` for ordinary list
CRUD are not permitted.
