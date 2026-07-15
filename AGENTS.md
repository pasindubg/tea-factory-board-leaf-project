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

Every record list must follow `.agents/skills/list-framework/SKILL.md`. Use the
shared `FrameworkList`/`ListSurface`, its permission-aware built-in `+ New`,
selection toolbar commands, inline ordinary editing, and `TabView` for two or
more related lists. CRUD lists must use the central opaque resource registry for
component-local soft reloads. Entity-specific refresh functions, row action
columns, page-level duplicate Add buttons, stacked related lists, and
`router.refresh()` for ordinary list CRUD are not permitted.
