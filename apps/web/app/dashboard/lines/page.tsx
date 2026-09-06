import { loadListResource } from "@/lib/list-resource-registry";
import { LinesTable } from "./lines-table";

export default async function LinesPage() {
  const lineResource = await loadListResource({ key: "leaf.lines" });
  if (!lineResource.ok) throw new Error(lineResource.error);

  return <LinesTable rows={lineResource.rows} />;
}
