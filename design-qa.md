# Shared detail-workspace framework QA

- Source visual truth: `/var/folders/r7/tyhnvynn76l_21dhr7ncs04r0000gn/T/codex-clipboard-a8f15095-9551-4882-a595-a868bda95424.png`
- Browser-rendered implementation: `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-framework-final-2026-07-20.png`
- Full-view comparison evidence: `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-framework-comparison-2026-07-20.png`
- Focused header comparison evidence: `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-header-comparison-2026-07-20.png`
- Route: `http://localhost:3000/dashboard/auction/c1399b49-a284-4c55-94fe-496f05174146`
- Comparison viewport: `1774 × 1240`
- State: existing draft broker invoice 0016, dark theme, no transient panel open

## Findings

No actionable P0, P1, or P2 findings remain.

- Fonts and typography: the implementation uses the existing Tea Factory Ops
  font stack, weights, uppercase field labels, and compact operational hierarchy.
  The source is a low-fidelity wireframe, so production typography intentionally
  follows the product tokens rather than the wireframe's default drawing font.
- Spacing and layout rhythm: the record rail, page command header, Invoice
  Details group, and Lot invoices group preserve the source's hierarchy. Header
  commands are ordered `+`, Search, State, Delete on the left, while the compact
  state indicator remains at the right edge.
- Colors and visual tokens: the wireframe's neutral blocks are mapped to the
  existing white/stone/green Tea Factory Ops surfaces. Red is reserved for the
  destructive Delete command and blue remains the state-progress accent.
- Image quality and asset fidelity: no illustrative source assets were required.
  The existing factory logo remains unchanged, and all new command artwork uses
  the installed Lucide icon family rather than text glyphs or hand-drawn SVGs.
- Copy and content: page-specific labels remain operationally explicit:
  `New invoice`, `Confirm broker invoice`, `Record GRN`, and
  `Delete broker invoice`.
- Icons and affordances: New, Search, State, Delete, Edit, and lifecycle
  affordances use consistent icon weight, practical target sizes, and visible
  keyboard focus.
- Responsiveness: at `900 × 1000` the shell stacks without horizontal overflow;
  at `390 × 844` commands wrap in source order, the indicator follows them, and
  document width remains within the viewport.
- Accessibility: State exposes `aria-expanded`, `aria-controls`, a semantic menu,
  first-enabled-command focus, arrow/Home/End navigation, and Escape focus
  restoration. Delete uses the shared semantic confirmation dialog. The state
  sequence expands on both pointer hover and keyboard focus.

## Interaction evidence

- State command group:
  `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-state-menu-2026-07-20.png`
- Expanded state indicator:
  `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-state-indicator-2026-07-20.png`
- Delete confirmation:
  `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-delete-confirmation-2026-07-20.png`
- Inline invoice creation:
  `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-new-inline-2026-07-20.png`
- Inline lot creation:
  `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-lot-inline-2026-07-20.png`
- Tablet layout:
  `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-tablet-2026-07-20.png`
- Mobile layout:
  `/Users/pasindu/Desktop/board-leaf-project/.artifacts/detail-workspace-mobile-2026-07-20.png`

## Comparison history

### Iteration 1

- [P2] State and Delete clicks triggered generic global messages such as
  `State selected` and `Delete selected` even though those controls already
  opened a visible menu or confirmation.
- Fix: marked the shared detail commands and confirmation-dialog controls as
  self-reporting actions so the global fallback does not duplicate their
  feedback.
- Post-fix evidence: the State menu and Delete confirmation open with no
  temporary status message; the final screenshot and focused header comparison
  show the clean header state.

### Iteration 2

- [P2] The first framework draft nested a second `<main>` landmark inside the
  dashboard's existing `<main>`, which would make landmark navigation ambiguous
  for assistive technology.
- Fix: changed the framework content slot to a neutral
  `data-detail-workspace-body` container while retaining the same grid placement
  and visual layout.
- Post-fix evidence: the rendered page contains one workspace body and zero
  nested `main main` landmarks; visual comparison is unchanged.

### Iteration 3

- Recompared the revised desktop render against the source in the full-view and
  focused-header composites. No actionable P0, P1, or P2 differences remained.

## Verification

- Web TypeScript typecheck: passed
- Monorepo TypeScript typecheck: passed
- Web and monorepo lint: passed with no warnings or errors
- Vitest: 6 files, 45 tests passed
- Browser console: no warnings or errors
- Primary interactions tested without persisting or deleting data: header order,
  Search open/apply, State open/Escape, keyboard focus restoration, current-state
  expansion, Delete open/cancel, inline New invoice open/cancel, inline Edit
  open/cancel, and inline New lot open/cancel

## Implementation checklist

- [x] Extract the record rail, header, command order, responsive grid, state
  indicator, state command menu, and delete confirmation into one typed framework.
- [x] Keep entity permissions, tenant-scoped mutations, transitions, forms, and
  related lists in page-specific adapters.
- [x] Put New before Search and keep State in the left command group.
- [x] Add the dustbin Delete command to eligible detail headers.
- [x] Preserve the compact current-state indicator on the right.
- [x] Preserve inline invoice create/edit and inline lot creation.
- [x] Document the migration contract for later detail pages.
- [x] Add lifecycle model tests to the normal web test suite.

final result: passed
