import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { mobileRequest } from "@/lib/api";
import { useSession } from "@/lib/session";
import { uploadSupplierImage } from "@/lib/upload";
import { colors, s } from "@/lib/theme";

type Capture = { uri: string; bytes: Blob };
type Fix = { latitude: number; longitude: number; accuracy: number | null };

export function SupplierRegistrationForm({ lineId, runMutation, onCreated, onCancel }: {
  lineId: string;
  runMutation: (mutation: () => Promise<void>) => Promise<boolean>;
  onCreated: (registrationNo: number) => void;
  onCancel: () => void;
}) {
  const { profile } = useSession();
  const [supplierId] = useState(() => crypto.randomUUID());
  const uploaded = useRef(new Map<string, Blob>());

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
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo.uri); }, [photo]);
  useEffect(() => () => { if (bankBook) URL.revokeObjectURL(bankBook.uri); }, [bankBook]);
  const [fix, setFix] = useState<Fix | null>(null);

  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const complete = name.trim() && phone.trim() && fix;

  async function capture(file: File, setter: (image: Capture) => void) {
    setError(null);
    try {
      if (!file.type.startsWith("image/") || file.size > 15 * 1024 * 1024) throw new Error("Choose an image smaller than 15 MB.");
      const image = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) { image.close(); throw new Error("Could not prepare this photo."); }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      image.close();
      const bytes = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.75));
      if (!bytes || bytes.size > 2 * 1024 * 1024) throw new Error("Choose a smaller photo.");
      setter({ uri: URL.createObjectURL(bytes), bytes });
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open this photo.");
    }
  }

  function captureLocation() {
    setError(null);
    if (!navigator.geolocation) {
      setError("Location capture is unavailable on this device.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setLocating(false);
      setFix({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy });
    }, ({ code }) => {
      setLocating(false);
      setError(code === 1 ? "Allow location access to record where the customer is." : "Could not get your location. Step outside and try again.");
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }

  async function save() {
    if (!profile || !lineId || !fix) return;
    setSaving(true);
    setError(null);

    let registrationNo = 0;
    const saved = await runMutation(async () => {
      for (const [kind, capture] of [["photo", photo], ["bank-book", bankBook]] as const) {
        if (!capture || uploaded.current.get(kind) === capture.bytes) continue;
        const result = await uploadSupplierImage(profile.factory_id, supplierId, kind, capture.bytes);
        if ("error" in result) throw new Error(`Could not upload the ${kind}. ${result.error}`);
        uploaded.current.set(kind, capture.bytes);
      }
      const receipt = await mobileRequest<{ registrationNo: number }>("/api/mobile/suppliers", {
        id: supplierId,
        line_id: lineId,
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
        photo_path: photo ? `${profile.factory_id}/${supplierId}/photo.jpg` : null,
        bank_book_path: bankBook ? `${profile.factory_id}/${supplierId}/bank-book.jpg` : null,
      });
      registrationNo = receipt.registrationNo;
    });
    setSaving(false);
    if (saved) onCreated(registrationNo);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={{ paddingVertical: 16, gap: 16 }}>
        {error && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}

        <View style={[s.card, { gap: 14 }]}>
          <Field label="Registration number">
            <TextInput
              style={s.input}
              value="Assigned automatically on save"
              editable={false}
              accessibilityLabel="Registration number, assigned automatically on save"
            />
            <Text style={s.faint}>The office will assign the existing customer number in the ERP after registration.</Text>
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
          <CaptureRow label="Customer photo" capture={photo} onPick={(file) => capture(file, setPhoto)} />
          <CaptureRow
            label="Bank book — detail page, clear image"
            capture={bankBook}
            onPick={(file) => capture(file, setBankBook)}
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
        <Pressable accessibilityRole="button" disabled={saving} onPress={onCancel} style={{ padding: 12 }}>
          <Text style={s.linkText}>Cancel registration</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
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

function CaptureRow({ label, capture, onPick }: { label: string; capture: Capture | null; onPick: (file: File) => void }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={s.h2}>{label}</Text>
      {capture && <Image source={{ uri: capture.uri }} style={{ width: 56, height: 56, borderRadius: 8 }} />}
      <input aria-label={label} type="file" accept="image/*" capture="environment" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) onPick(file);
      }} />
    </View>
  );
}
