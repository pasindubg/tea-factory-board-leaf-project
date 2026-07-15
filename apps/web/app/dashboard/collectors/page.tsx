import { loadListResource } from "@/lib/list-resource-registry";
import { CollectorsTable } from "./collectors-table";

export default async function CollectorsPage() {
  const collectorResource = await loadListResource({ key: "leaf.collectors" });
  if (!collectorResource.ok) throw new Error(collectorResource.error);

  return <CollectorsTable rows={collectorResource.rows} />;
}
