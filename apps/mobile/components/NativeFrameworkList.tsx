import type { ReactNode } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
  type FlatListProps,
} from "react-native";
import { colors, s } from "@/lib/theme";

export type NativeFrameworkListState<T> = {
  rows: readonly T[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  refresh?: () => Promise<boolean>;
};

export type NativeFrameworkListProps<T> = Omit<
  FlatListProps<T>,
  "data" | "refreshControl" | "ListHeaderComponent" | "ListEmptyComponent" | "ListFooterComponent"
> & {
  list: NativeFrameworkListState<T>;
  title?: ReactNode;
  description?: ReactNode;
  /** Common list-level actions such as mark-all-read or export. */
  actions?: ReactNode;
  /** Built-in create affordance. Omit for genuinely read-only lists. */
  onCreate?: () => void;
  canCreate?: boolean;
  createDisabledReason?: string;
  createLabel?: string;
  /** Additional content below the standardized list header. */
  header?: ReactNode;
  footer?: ReactNode;
  emptyMessage: string;
};

/**
 * Expo renderer for the shared headless list contract. It intentionally lives
 * in the native app so @tea/ui never imports React Native or DOM primitives.
 */
export function NativeFrameworkList<T>({
  list,
  title,
  description,
  actions,
  onCreate,
  canCreate = true,
  createDisabledReason,
  createLabel = "New",
  header,
  footer,
  emptyMessage,
  contentContainerStyle,
  ...flatListProps
}: NativeFrameworkListProps<T>) {
  const hasFrameworkHeader = Boolean(title || description || actions || onCreate);

  return (
    <FlatList
      {...flatListProps}
      data={list.rows}
      contentContainerStyle={[{ flexGrow: 1 }, contentContainerStyle]}
      refreshControl={list.refresh ? (
        <RefreshControl
          refreshing={Boolean(list.refreshing)}
          onRefresh={() => { void list.refresh?.(); }}
          tintColor={colors.green}
          colors={[colors.green]}
        />
      ) : undefined}
      ListHeaderComponent={(
        <>
          {hasFrameworkHeader && (
            <View style={[s.card, { marginBottom: 12, padding: 14 }]}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  {typeof title === "string" ? <Text style={s.h2}>{title}</Text> : title}
                  {typeof description === "string" ? (
                    <Text style={[s.muted, { marginTop: title ? 2 : 0 }]}>{description}</Text>
                  ) : description}
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  {actions}
                  {onCreate && (
                    <View style={{ alignItems: "flex-end" }}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={createLabel}
                        accessibilityHint={!canCreate ? createDisabledReason : undefined}
                        accessibilityState={{ disabled: !canCreate }}
                        disabled={!canCreate}
                        onPress={onCreate}
                        style={[s.button, { minHeight: 40, paddingHorizontal: 14, paddingVertical: 9 }, !canCreate && s.buttonDisabled]}
                      >
                        <Text style={s.buttonText}>＋ {createLabel}</Text>
                      </Pressable>
                    </View>
                  )}
                </View>
              </View>
              {onCreate && !canCreate && createDisabledReason ? (
                <Text style={[s.faint, { marginTop: 6, textAlign: "right" }]}>{createDisabledReason}</Text>
              ) : null}
            </View>
          )}
          {header}
          {list.error && (
            <View style={[s.errorBox, { marginBottom: 12 }]} accessibilityRole="alert">
              <Text style={s.errorText}>{list.error}</Text>
            </View>
          )}
        </>
      )}
      ListEmptyComponent={list.loading ? (
        <View style={{ padding: 24, alignItems: "center" }}>
          <ActivityIndicator color={colors.green} />
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.muted}>{emptyMessage}</Text>
        </View>
      )}
      ListFooterComponent={<>{footer}</>}
    />
  );
}
