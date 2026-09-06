import { loadListResource } from "@/lib/list-resource-registry";
import { DriversTable } from "./drivers-table";

export default async function DriversPage() {
  const driverResource = await loadListResource({ key: "leaf.drivers" });
  if (!driverResource.ok) throw new Error(driverResource.error);

  return <DriversTable rows={driverResource.rows} />;
}
