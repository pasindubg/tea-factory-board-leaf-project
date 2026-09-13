import { supabase } from "./supabase";

const BUCKET = "supplier-documents";
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// React Native has no Buffer and no reliable blob upload path, so images come
// back from the picker as base64 and are decoded to bytes here.
function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, "");
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byte = 0;
  let bits = 0;
  let out = 0;
  for (const char of clean) {
    byte = (byte << 6) | ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (byte >> bits) & 0xff;
    }
  }
  return bytes.subarray(0, out);
}

export async function uploadSupplierImage(
  factoryId: string,
  supplierId: string,
  kind: "photo" | "bank-book",
  base64: string,
): Promise<{ path: string } | { error: string }> {
  const path = `${factoryId}/${supplierId}/${kind}.jpg`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, base64ToBytes(base64), { contentType: "image/jpeg", upsert: true });
  if (error) return { error: error.message };
  return { path };
}

export async function removeSupplierImages(paths: string[]) {
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
}
