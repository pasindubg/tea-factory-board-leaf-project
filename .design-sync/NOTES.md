# Design Sync Notes — Tea Factory Ops

## Setup

- pnpm hoisted monorepo (`node-linker=hoisted`); react resolves from root `node_modules`, not the package's own.
- Always pass `--node-modules ./node_modules` (repo root) to `package-build.mjs`, not `packages/ui/node_modules`.
- `--entry packages/ui/dist/index.js` needed explicitly (converter can't self-detect in monorepo).
- `cssEntry` in config points at `packages/ui/dist/styles.css` — the Tailwind v4 compiled output.
  Rebuild CSS before re-syncing if component classes changed:
  ```bash
  .ds-sync/node_modules/.bin/tailwindcss -i packages/ui/src/styles/globals.css \
    --content "packages/ui/src/**/*.{tsx,ts}" -o packages/ui/dist/styles.css --minify
  ```
  Then re-run `pnpm --dir packages/ui build` (tsc) before the converter.
- The `! cssEntry: … not found — skipped` warning fires every build but the CSS IS copied (it resolves correctly from the repo root). Non-issue.

## Known render warns

- None. All 11 previews render cleanly.

## Playwright

- Installed in `.ds-sync/node_modules` (v1228, chromium-headless-shell).
- Cache: `~/.cache/ms-playwright/chromium_headless_shell-1228`.
- On fresh clone: `cd .ds-sync && npm i && ./node_modules/.bin/playwright install chromium`.

## Re-sync risks

- **Tailwind CSS** is pre-compiled (`packages/ui/dist/styles.css`). If new utility classes are added to components, rebuild CSS before re-syncing — stale CSS means new classes won't appear in designs.
- **6 floor-card components** (CardHeader, FormCard, PageHeader, Select, Spinner, Table) have no authored previews. They ship functional but show only the typographic floor card. Author `previews/<Name>.tsx` on any re-sync to upgrade them.
- **React pinned to 19.2.3** via pnpm.overrides in root package.json. Bump both `react` and `react-dom` together if upgrading.
