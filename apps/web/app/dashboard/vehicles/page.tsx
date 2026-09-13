import { loadListResource } from "@/lib/list-resource-registry";
import { VehiclesTable } from "./vehicles-table";

export default async function VehiclesPage() {
  const vehicleResource = await loadListResource({ key: "leaf.vehicles" });
  if (!vehicleResource.ok) throw new Error(vehicleResource.error);

  return <VehiclesTable rows={vehicleResource.rows} />;
}
