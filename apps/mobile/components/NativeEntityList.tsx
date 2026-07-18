import { useCallback, type ReactElement, type ReactNode } from "react";
import { useFocusEffect } from "expo-router";
import type { ListRenderItemInfo } from "react-native";
import {
  useFrameworkListController,
  type FrameworkListController,
  type FrameworkListControllerOptions,
} from "@tea/ui/list-controller";
import {
  NativeFrameworkList,
  type NativeFrameworkListProps,
} from "@/components/NativeFrameworkList";

type EntityListValue<T> = ReactNode | ((list: FrameworkListController<T>) => ReactNode);

export type NativeEntityListProps<T> = Omit<
  NativeFrameworkListProps<T>,
  "list" | "title" | "description" | "actions" | "header" | "footer" | "renderItem"
> & {
  loadRows: () => Promise<readonly T[]>;
  controllerOptions?: FrameworkListControllerOptions<T>;
  title?: EntityListValue<T>;
  description?: EntityListValue<T>;
  actions?: EntityListValue<T>;
  header?: EntityListValue<T>;
  footer?: EntityListValue<T>;
  renderItem: (
    info: ListRenderItemInfo<T>,
    list: FrameworkListController<T>,
  ) => ReactElement | null;
};

function resolveValue<T>(
  value: EntityListValue<T> | undefined,
  list: FrameworkListController<T>,
) {
  return typeof value === "function"
    ? (value as (controller: FrameworkListController<T>) => ReactNode)(list)
    : value;
}

/**
 * Entity-level Expo list adapter. Screens provide only their loader, row
 * presentation, and domain commands; this component owns focus reload,
 * pull-to-refresh, mutation refresh, loading, and error state.
 */
export function NativeEntityList<T>({
  loadRows,
  controllerOptions,
  title,
  description,
  actions,
  header,
  footer,
  renderItem,
  ...listProps
}: NativeEntityListProps<T>) {
  const list = useFrameworkListController(loadRows, controllerOptions);

  useFocusEffect(useCallback(() => {
    void list.reload();
  }, [list.reload, loadRows]));

  return (
    <NativeFrameworkList
      {...listProps}
      list={list}
      title={resolveValue(title, list)}
      description={resolveValue(description, list)}
      actions={resolveValue(actions, list)}
      header={resolveValue(header, list)}
      footer={resolveValue(footer, list)}
      renderItem={(info) => renderItem(info, list)}
    />
  );
}
