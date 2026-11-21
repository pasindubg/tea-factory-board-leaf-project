import { getDevice } from "./bridge";
import { mobileRequest } from "./api";
import type { DeviceRegistration } from "./types";

export async function bindThisDevice(): Promise<DeviceRegistration> {
  const device = await getDevice();
  if (!device) return "invalid";
  const { platform, model, appVersion } = device;
  return (await mobileRequest<{ binding: DeviceRegistration }>("/api/mobile/device-bind", { platform, model, appVersion })).binding;
}
