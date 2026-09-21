export type ListViewPreferences = {
  mode: "list" | "table";
  widths: Record<string, number>;
  order: string[];
  hidden: string[];
};

export function parseListViewPreferences(raw: string | null): ListViewPreferences {
  const defaults: ListViewPreferences = { mode: "list", widths: {}, order: [], hidden: [] };
  try {
    const value = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object") return defaults;
    const keys = (input: unknown): string[] => Array.isArray(input)
      ? [...new Set(input.filter((key): key is string => typeof key === "string"))] : [];
    const widths = Object.fromEntries(Object.entries(value.widths ?? {}).filter(([, width]) =>
      typeof width === "number" && Number.isFinite(width) && width > 0));
    return { mode: value.mode === "table" ? "table" : "list", widths: widths as Record<string, number>, order: keys(value.order), hidden: keys(value.hidden) };
  } catch {
    return defaults;
  }
}

export function listViewStorageKey(userId: string, factoryId: string, scope: string) {
  return `list-view:v2:${JSON.stringify([factoryId, userId, scope])}`;
}

/** Keep new fields visible, discard removed keys, and always retain one field. */
export function resolveListFields<T extends { key: string }>(columns: T[], preferences: Pick<ListViewPreferences, "order" | "hidden">, editing = false) {
  if (editing) return { ordered: columns, visible: columns };
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const keys = [...new Set([...preferences.order, ...byKey.keys()])].filter((key) => byKey.has(key));
  const ordered = keys.map((key) => byKey.get(key)!);
  const visible = ordered.filter((column) => !preferences.hidden.includes(column.key));
  return { ordered, visible: visible.length ? visible : ordered.slice(0, 1) };
}
