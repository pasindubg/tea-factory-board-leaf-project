import { loadListResource } from "@/lib/list-resource-registry";
import { DevicesTable } from "./devices-table";

export default async function DevicesPage() {
  const deviceResource = await loadListResource({ key: "users.devices" });
  if (!deviceResource.ok) throw new Error(deviceResource.error);

  return <DevicesTable rows={deviceResource.rows} />;
}
