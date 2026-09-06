import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/session";
import { removeSupplierImages, uploadSupplierImage } from "@/lib/upload";
import { colors, s } from "@/lib/theme";

type Capture = { uri: string; base64: string };
type Fix = { latitude: number; longitude: number; accuracy: number | null };

export default function NewCustomer() {
  const { id: lineId } = useLocalSearchParams<{ id: string }>();
  const { profile } = useSession();
  const router = useRouter();

  const [customerNo, setCustomerNo] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nic, setNic] = useState("");
  const [area, setArea] = useState("");
  const [address, setAddress] = useState("");
  const [bankAccountNo, setBankAccountNo] = useState("");
  const [landExtent, setLandExtent] = useState("");
  const [cultivated, setCultivated] = useState("");
  const [photo, setPhoto] = useState<Capture | null>(null);
  const [bankBook, setBankBook] = useState<Capture | null>(null);
  const [fix, setFix] = useState<Fix | null>(null);

  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = customerNo.trim() && name.trim() && phone.trim() && fix;

  async function capture(setter: (capture: Capture) => void) {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError("Camera permission is needed to take the photo.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.6,
      base64: true,
      mediaTypes: ["images"],
    });
    const asset = result.canceled ? null : result.assets[0];
    if (asset?.base64) setter({ uri: asset.uri, base64: asset.base64 });
  }

  async function captureLocation() {
    setLocating(true);
    setError(null);
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setLocating(false);
      setError("Location permission is needed to record where the customer is.");
      return;
    }
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setFix({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
    });
    setLocating(false);
  }

  async function save() {
    if (!profile || !lineId || !fix) return;
    setSaving(true);
    setError(null);

    const trimmedCustomerNo = customerNo.trim();
    const { data: existing } = await supabase
      .from("suppliers")
      .select("id, name")
      .eq("factory_id", profile.factory_id)
      .eq("customer_no", trimmedCustomerNo)
      .maybeSingle();
    if (existing) {
      setSaving(false);
      setError(`Customer ${trimmedCustomerNo} is already registered as ${existing.name}.`);
      return;
    }

    const supplierId = Crypto.randomUUID();
    const uploaded: string[] = [];

    for (const [kind, capture] of [
      ["photo", photo],
      ["bank-book", bankBook],
    ] as const) {
      if (!capture) continue;
      const result = await uploadSupplierImage(profile.factory_id, supplierId, kind, capture.base64);
      if ("error" in result) {
        await removeSupplierImages(uploaded);
        setSaving(false);
        setError(`Could not upload the ${kind === "photo" ? "photo" : "bank book image"}. ${result.error}`);
        return;
      }
      uploaded.push(result.path);
    }

    const { error: insertError } = await supabase.from("suppliers").insert({
      id: supplierId,
      client_uuid: supplierId,
      factory_id: profile.factory_id,
      line_id: lineId,
      customer_no: trimmedCustomerNo,
      name: name.trim(),
      phone: phone.trim(),
      nic_number: nic.trim().toUpperCase() || null,
      area: area.trim() || null,
      address: address.trim() || null,
      bank_account_no: bankAccountNo.trim() || null,
      land_size_acres: landExtent.trim() || null,
      cultivated_area_acres: cultivated.trim() || null,
      latitude: fix.latitude,
      longitude: fix.longitude,
      location_accuracy_m: fix.accuracy,
      location_captured_at: new Date().toISOString(),
      photo_path: photo ? `${profile.factory_id}/${supplierId}/photo.jpg` : null,
      bank_book_path: bankBook ? `${profile.factory_id}/${supplierId}/bank-book.jpg` : null,
      bank_parse_status: bankBook ? "pending" : null,
      registered_by_user_id: profile.id,
      registered_at: new Date().toISOString(),
    });

    if (insertError) {
      await removeSupplierImages(uploaded);
      setSaving(false);
      setError(insertError.message);
      return;
    }

    setSaving(false);
    router.back();
  }

  return (
    <SafeAreaView style={s.screen} edges={["bottom"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }} keyboardShouldPersistTaps="handled">
          {error && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{error}</Text>
            </View>
          )}

          <View style={[s.card, { gap: 14 }]}>
            <Field label="Customer number *">
              <TextInput
                style={s.input}
                value={customerNo}
                onChangeText={(text) => setCustomerNo(text.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                autoCorrect={false}
                placeholder="As in the existing system"
                placeholderTextColor={colors.faint}
              />
            </Field>
            <Field label="Customer name *">
              <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={colors.faint} />
            </Field>
            <Field label="Mobile number *">
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="07xxxxxxxx"
                placeholderTextColor={colors.faint}
              />
            </Field>
            <Field label="NIC number">
              <TextInput
                style={s.input}
                value={nic}
                onChangeText={setNic}
                autoCapitalize="characters"
                autoCorrect={false}
                placeholder="199012345678 or 901234567V"
                placeholderTextColor={colors.faint}
              />
            </Field>
            <Field label="Area">
              <TextInput
                style={s.input}
                value={area}
                onChangeText={setArea}
                placeholder="Village or division"
                placeholderTextColor={colors.faint}
              />
            </Field>
            <Field label="Address">
              <TextInput
                style={[s.input, { minHeight: 64 }]}
                value={address}
                onChangeText={setAddress}
                multiline
                placeholderTextColor={colors.faint}
              />
            </Field>
          </View>

          <View style={[s.card, { gap: 14 }]}>
            <Text style={s.h2}>Location *</Text>
            <Text style={s.muted}>
              {fix
                ? `${fix.latitude.toFixed(6)}, ${fix.longitude.toFixed(6)}${fix.accuracy ? ` · ±${Math.round(fix.accuracy)} m` : ""}`
                : "Stand at the customer's gate before capturing."}
            </Text>
            <Pressable style={[s.button, locating && s.buttonDisabled]} disabled={locating} onPress={captureLocation}>
              {locating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.buttonText}>{fix ? "Capture again" : "Capture location"}</Text>
              )}
            </Pressable>
          </View>

          <View style={[s.card, { gap: 14 }]}>
            <Text style={s.h2}>Photos</Text>
            <Text style={s.faint}>Optional, but the office needs them to confirm the bank account.</Text>
            <CaptureRow label="Customer photo" capture={photo} onPress={() => capture(setPhoto)} />
            <CaptureRow
              label="Bank book — detail page, clear image"
              capture={bankBook}
              onPress={() => capture(setBankBook)}
            />
            <Field label="Bank account number">
              <TextInput
                style={s.input}
                value={bankAccountNo}
                onChangeText={setBankAccountNo}
                keyboardType="number-pad"
                autoCorrect={false}
                placeholder="As printed in the bank book"
                placeholderTextColor={colors.faint}
              />
            </Field>
          </View>

          <View style={[s.card, { gap: 14 }]}>
            <Field label="Land extent (acres)">
              <TextInput
                style={s.input}
                value={landExtent}
                onChangeText={setLandExtent}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.faint}
              />
            </Field>
            <Field label="Cultivated area (acres)">
              <TextInput
                style={s.input}
                value={cultivated}
                onChangeText={setCultivated}
                keyboardType="decimal-pad"
                placeholderTextColor={colors.faint}
              />
            </Field>
          </View>

          <Pressable style={[s.button, (!complete || saving) && s.buttonDisabled]} disabled={!complete || saving} onPress={save}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.buttonText}>Save customer</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={s.label}>{label}</Text>
      {children}
    </View>
  );
}

function CaptureRow({ label, capture, onPress }: { label: string; capture: Capture | null; onPress: () => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      {capture ? (
        <Image source={{ uri: capture.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />
      ) : (
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={s.faint}>—</Text>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={s.h2}>{label}</Text>
        <Pressable onPress={onPress}>
          <Text style={{ color: colors.green, fontWeight: "600", marginTop: 4 }}>
            {capture ? "Retake" : "Take photo"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
