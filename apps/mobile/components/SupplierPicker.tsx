import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (sup) => sup.name.toLowerCase().includes(q) || (sup.area ?? "").toLowerCase().includes(q),
    );
  }, [suppliers, query]);

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
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={s.h2}>Select supplier</Text>
              <Pressable onPress={() => setOpen(false)} hitSlop={8}>
                <Text style={{ color: colors.green, fontSize: 14, fontWeight: "500" }}>Close</Text>
              </Pressable>
            </View>

            <TextInput
              style={[s.input, { marginTop: 12 }]}
              value={query}
              onChangeText={setQuery}
              placeholder="Search name or area"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
            />

            <FlatList
              style={{ marginTop: 8 }}
              data={filtered}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={<Text style={[s.faint, { padding: 16 }]}>No suppliers found.</Text>}
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
