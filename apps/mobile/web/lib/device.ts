import { getDevice } from "./bridge";

export async function getDeviceId() {
  return (await getDevice())?.deviceId ?? "";
}
