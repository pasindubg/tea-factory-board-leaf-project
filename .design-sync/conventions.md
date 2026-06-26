# Tea Factory Ops — Design System Conventions

## No provider wrapper needed
Components render standalone. No ThemeProvider or context wrapper is required.

## Styling idiom: Tailwind v4 utility classes
This DS uses Tailwind v4. Style your own layout glue with utility classes — do NOT add custom CSS or inline styles unless composing a preview wrapper.

Key class families in use:

| Purpose | Examples |
|---|---|
| Background | `bg-white`, `bg-stone-50`, `bg-green-700`, `bg-red-50`, `bg-amber-50` |
| Text | `text-stone-900`, `text-stone-500`, `text-green-800`, `text-red-700`, `text-white` |
| Border | `border`, `border-stone-200`, `border-stone-300`, `border-green-600` |
| Spacing | `p-4`, `p-6`, `px-3`, `py-2`, `gap-3`, `space-y-4` |
| Radius | `rounded-md`, `rounded-xl`, `rounded-full` |
| Layout | `flex`, `flex-col`, `items-center`, `justify-between`, `w-full`, `max-w-lg` |
| States | `disabled:opacity-60`, `hover:bg-green-800`, `focus:border-green-600` |

## Where the truth lives
- Compiled styles: `_ds_bundle.css` (imported by `styles.css` — all designs receive it)
- Per-component API: each `components/<group>/<Name>/<Name>.d.ts`
- Usage docs: each `components/<group>/<Name>/<Name>.prompt.md`

## Components available
`Button`, `Input`, `Select`, `Alert`, `Badge`, `Spinner`, `Card`, `CardHeader`, `FormCard`, `PageHeader`, `Table`

All are exported from `window.TeaUI.*`.

## Idiomatic build snippet

```jsx
// A supplier list row — DS components + Tailwind layout glue
<div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
  <div>
    <p className="text-sm font-medium text-stone-900">Karunaratne Estate</p>
    <p className="text-xs text-stone-500">Kandy area · 2.5 acres</p>
  </div>
  <Badge variant="success">Superleaf</Badge>
</div>
```

For forms, wrap fields in `<FormCard>` and end with a `<Button variant="primary">` + `<Button variant="secondary">Cancel</Button>` row.
