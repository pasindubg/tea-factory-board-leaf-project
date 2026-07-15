import { useMemo, useState } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { filterFrameworkListRows } from "@tea/ui/list-controller";
import { NativeFrameworkList } from "@/components/NativeFrameworkList";
import type { Supplier } from "@/lib/types";
import { colors, s } from "@/lib/theme";

// A tap-to-open modal list with a search box. Built from primitives instead of
// @react-native-picker/picker so it works identically in Expo Go and on web.
export function SupplierPicker({
  suppliers,
  selected,
  onSelect,
}: {
  suppliers: Supplier[];
  selected: Supplier | null;
  onSelect: (s: Supplier) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(
    () => filterFrameworkListRows(suppliers, query, (supplier) => [supplier.name, supplier.area]),
    [suppliers, query],
  );

  return (
    <View>
      <Pressable style={s.input} onPress={() => setOpen(true)}>
        <Text style={{ fontSize: 16, color: selected ? colors.text : colors.faint }}>
          {selected ? selected.name : "Select a supplier"}
        </Text>
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" }}>
          <View
            style={{
              backgroundColor: colors.bg,
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: "80%",
              padding: 16,
            }}
          >
            <NativeFrameworkList
              list={{ rows: filtered }}
              title="Select supplier"
              actions={(
                <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                  <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Close</Text>
                </Pressable>
              )}
              header={(
                <TextInput
                  style={[s.input, { marginBottom: 8 }]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search name or area"
                  placeholderTextColor={colors.faint}
                  autoCapitalize="none"
                />
              )}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              emptyMessage="No suppliers found."
              renderItem={({ item }) => (
                <Pressable
                  style={{ paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}
                  onPress={() => {
                    onSelect(item);
                    setOpen(false);
                    setQuery("");
                  }}
                >
                  <Text style={{ fontSize: 16, color: colors.text }}>{item.name}</Text>
                  {item.area ? <Text style={[s.faint, { marginTop: 2 }]}>{item.area}</Text> : null}
                </Pressable>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
