import { accessToken } from "./auth";
import { getDeviceId } from "./device";
import { apiBaseUrl } from "./env";

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

async function documents(method: "POST" | "DELETE", body: unknown): Promise<{ url?: string; error?: string; headers?: Record<string, string> }> {
  const token = await accessToken();
  if (!token) return { error: "Not signed in." };
  try {
    const res = await fetch(`${apiBaseUrl}/api/mobile/supplier-documents`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-device-id": await getDeviceId(),
      },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    return res.ok ? json : { error: json.error ?? `Request failed (${res.status}).` };
  } catch {
    return { error: "Could not reach the server. Check your connection." };
  }
}

export async function uploadSupplierImage(
  factoryId: string,
  supplierId: string,
  kind: "photo" | "bank-book",
  base64: string,
): Promise<{ path: string } | { error: string }> {
  const path = `${factoryId}/${supplierId}/${kind}.jpg`;
  const bytes = base64ToBytes(base64).slice().buffer as ArrayBuffer;
  const signed = await documents("POST", { path, contentType: "image/jpeg", size: bytes.byteLength });
  if (!signed.url) return { error: signed.error ?? "Upload failed." };
  try {
    const res = await fetch(signed.url, { method: "PUT", headers: { "Content-Type": "image/jpeg", ...signed.headers }, body: bytes });
    if (!res.ok) return { error: `Upload failed (${res.status}).` };
  } catch {
    return { error: "Could not reach the server. Check your connection." };
  }
  return { path };
}

export async function removeSupplierImages(paths: string[]) {
  if (paths.length) await documents("DELETE", { paths });
}
