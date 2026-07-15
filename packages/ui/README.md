# @tea/ui migration guide

`apps/web/components/list-controls.tsx` remains the web application's list
behaviour layer: column search, sorting, selection, inline editing, and list
commands stay there. `@tea/ui` now owns the reusable framing primitives that
give list pages a consistent create action and make related lists share one
work surface.

## Add `FrameworkList` around an existing list

Keep the existing `useListControls`, `ListSearchPanel`, `ListCommandToolbar`,
and table markup. Wrap the existing surface with `FrameworkList`, moving any
page-level creation trigger into `onCreate` and placing search, export, or
other common actions in `actions`.

```tsx
import { FrameworkList } from "@tea/ui";

<FrameworkList
  title="Suppliers"
  onCreate={() => setCreateOpen(true)}
  canCreate={canManageSuppliers}
  createDisabledReason="Only an owner or manager can add suppliers."
  actions={<ExportSuppliersButton />}
>
  <ListCreatePanel open={createOpen}>{/* create form */}</ListCreatePanel>
  <ListCommandToolbar /* edit, delete, and domain commands only */ />
  <SuppliersTable /* existing controls and rows */ />
</FrameworkList>
```

`onCreate` is the opt-in: omit it when a list cannot create records. Set
`canCreate={false}` to keep the New button visible but disabled; provide
`createDisabledReason` for the native hover tooltip.

In the web app, use `ListSurface` instead of importing `FrameworkList`
directly; `ListSurface` is the web behavior-layer adapter and accepts the same
header/create props. Do not nest the two components or add another New action
to `ListCommandToolbar`.

CRUD lists pass an opaque `resource` to `useFrameworkListData`. Register the
read model once in the server-only resource registry. Do not create a refresh
server action for each entity: the framework's shared dispatcher reloads only
the mounted list instances for that resource after a successful mutation.

## Move stacked related lists into `TabView`

When two or more full operational lists belong to one work surface, preserve
each list's independent controls and place the finished list surfaces in tabs.

```tsx
import { TabView } from "@tea/ui";

<TabView
  label="Auction work lists"
  defaultTabId="lots"
  tabs={[
    { id: "lots", label: "Lots", badge: lots.length, content: <LotsList /> },
    { id: "dispatches", label: "Dispatches", badge: dispatches.length, content: <DispatchesList /> },
  ]}
/>
```

`TabView` supports controlled state through `activeTabId` and `onTabChange`.
It uses tab semantics, supports Arrow Left/Right and Home/End navigation, and
keeps inactive list panels mounted so their search and selection state is
retained.

## Expo lists use the headless subpath

React Native must not import the DOM component barrel from `@tea/ui`. Import
the platform-neutral controller from `@tea/ui/list-controller`, then render it
with `apps/mobile/components/NativeFrameworkList.tsx`:

```tsx
const list = useFrameworkListController(loadRows);

useFocusEffect(useCallback(() => {
  void list.reload();
}, [list.reload]));

<NativeFrameworkList
  list={list}
  keyExtractor={(row) => row.id}
  emptyMessage="No records yet."
  renderItem={({ item }) => <NativeRecordCard record={item} />}
/>;
```

The controller owns rows, list-local loading/pull-to-refresh, mutation reloads,
and visible errors. `NativeFrameworkList` owns Expo `FlatList` and
`RefreshControl`. Its `onCreate`, `canCreate`, `createDisabledReason`,
`createLabel`, and `actions` props mirror the web list header contract; creation
must be exposed there instead of as a detached screen-level `+` button. Omit
`onCreate` only for a genuinely read-only list. Tenant authority remains
outside both UI layers: loaders and mutations must derive `factory_id` and
user-linked IDs from the authenticated profile and include those predicates in
every Supabase operation.
