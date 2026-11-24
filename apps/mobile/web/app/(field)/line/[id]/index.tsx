import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "@/runtime/safe-area";
import { useLocalSearchParams } from "@/runtime/navigation";
import { NativeEntityList } from "@/components/NativeEntityList";
import { NativeListCreatePanel } from "@/components/NativeFrameworkList";
import { SupplierRegistrationForm } from "@/components/SupplierRegistrationForm";
import { useSession } from "@/lib/session";
import { s } from "@/lib/theme";
import type { CustomerRow } from "@/lib/types";
import { roleMayRegisterSuppliers } from "@/lib/types";

export default function LineCustomers() {
  const { id, lineNo, register } = useLocalSearchParams<{ id: string; lineNo?: string; register?: string }>();
  const { profile } = useSession();
  const [creating, setCreating] = useState(register === "1");
  const [registeredNo, setRegisteredNo] = useState<number | null>(null);
  const canCreate = roleMayRegisterSuppliers(profile?.role);
  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <NativeEntityList<CustomerRow>
        resource={{ key: "field.line-suppliers", params: { lineId: id } }}
        title={lineNo ? `Line ${lineNo}` : "Suppliers on this line"}
        description={(list) => `${list.rows.length} suppliers registered`}
        onCreate={() => { setRegisteredNo(null); setCreating(true); }}
        canCreate={canCreate && !creating}
        createDisabledReason={creating ? "Complete or cancel the current registration." : "Sign in as a driver or field officer."}
        header={(list) => (
          <>
            {registeredNo != null && <Text accessibilityRole="alert" style={s.muted}>Supplier registered. Registration no: {registeredNo}. Customer number awaiting office assignment.</Text>}
            <NativeListCreatePanel open={creating && canCreate} title="New supplier">
              <SupplierRegistrationForm key={id} lineId={id} runMutation={list.runMutation}
                onCreated={(number) => { setRegisteredNo(number); setCreating(false); }} onCancel={() => setCreating(false)} />
            </NativeListCreatePanel>
          </>
        )}
        keyExtractor={(customer) => customer.id}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        keyboardShouldPersistTaps="handled"
        emptyMessage="No suppliers on this line yet. Use + New to register the first."
        renderItem={({ item }) => (
          <View style={s.card}>
            <Text style={s.h2}>{item.name}</Text>
            <Text style={s.muted}>Registration no: {item.registration_no}</Text>
            <Text style={s.faint}>Customer no: {item.customer_no ?? "Awaiting office assignment"}</Text>
            <Text style={[s.muted, { marginTop: 4 }]}>{item.phone}</Text>
            {item.address ? <Text style={s.faint}>{item.address}</Text> : null}
            <Text style={[s.faint, { marginTop: 4 }]}>📍 {Number(item.latitude).toFixed(5)}, {Number(item.longitude).toFixed(5)}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}
