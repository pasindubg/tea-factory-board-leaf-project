import { supabase } from "./supabase";
import { deviceDescription, getDeviceId } from "./device";
import type { DeviceRegistration } from "./types";

// Claims this phone for the signed-in login, or reports that the login is
// already bound elsewhere. The database decides — see register_device() in
// migration 0065.
export async function bindThisDevice(): Promise<DeviceRegistration> {
  const { platform, model, appVersion } = deviceDescription();
  const { data, error } = await supabase.rpc("register_device", {
    p_device_id: await getDeviceId(),
    p_platform: platform,
    p_model: model,
    p_app_version: appVersion,
  });
  if (error) return "invalid";
  return (data as DeviceRegistration) ?? "invalid";
}
