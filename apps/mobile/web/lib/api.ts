import { mobileAuthHeaders } from "./auth";
import { apiBaseUrl } from "./env";
import type { MobileRegistrationResource } from "./types";

export async function mobileRequest<T>(path: string, body: unknown): Promise<T> {
  const auth = await mobileAuthHeaders();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
    headers: { "Content-Type": "application/json", ...auth.headers },
    body: JSON.stringify(body),
  });
  await auth.handleResponse(response);
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) throw new Error(result?.error ?? "Could not reach the ERP. Please try again.");
  return result as T;
}

export async function loadMobileResource<T>(resource: MobileRegistrationResource): Promise<readonly T[]> {
  const result = await mobileRequest<{ rows: T[] }>("/api/mobile/list-resource", resource);
  return result.rows;
}

type MobileReadResource =
  | "supplier.home"
  | "supplier.request-type"
  | "supplier.requests"
  | "supplier.messages"
  | "driver.handovers"
  | "collector.suppliers"
  | "collector.weighings";

type MobileCommand =
  | { action: "supplier.request.create"; id: string; typeKey: string; payload: Record<string, string | boolean>; amount: string | null; note: string | null }
  | { action: "supplier.request.acknowledge" | "driver.handover"; id: string }
  | { action: "supplier.messages.read"; ids: string[] }
  | { action: "collector.weighing.create"; id: string; supplierId: string; weightKg: string };

export function readResource<T>(resource: MobileReadResource, params?: { key: string }) {
  return mobileRequest<T>("/api/mobile/data", { resource, params });
}

export function runCommand(command: MobileCommand) {
  return mobileRequest<{ ok: true }>("/api/mobile/command", command);
}
