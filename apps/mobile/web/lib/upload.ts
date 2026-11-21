import { accessToken } from "./auth";
import { getDeviceId } from "./device";

export async function uploadSupplierImage(
  factoryId: string,
  supplierId: string,
  kind: "photo" | "bank-book",
  bytes: Blob,
): Promise<{ path: string } | { error: string }> {
  try {
    const token = await accessToken();
    if (!token) return { error: "Not signed in." };
    const path = `${factoryId}/${supplierId}/${kind}.jpg`;
    const response = await fetch(`/api/mobile/supplier-documents?path=${encodeURIComponent(path)}`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg", Authorization: `Bearer ${token}`, "x-device-id": await getDeviceId() },
      body: bytes,
      cache: "no-store",
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      return { error: body?.error ?? `Upload failed (${response.status}).` };
    }
    return { path };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not upload the photo." };
  }
}
