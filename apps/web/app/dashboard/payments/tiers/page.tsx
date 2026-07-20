import { friendlyError } from "@/lib/errors";
import { loadListResource } from "@/lib/list-resource-registry";
import { requirePageAccess } from "@/lib/profile";
import { MANAGEMENT_ROLES } from "@/lib/roles";
import {
  TierAssignmentsTable,
  type TierOption,
  type TierSupplierOption,
} from "./tier-assignments-table";

export default async function TiersPage() {
  const { supabase, profile } = await requirePageAccess("payment-tiers");
  const [assignmentResource, { data: tiers, error: tierError }] = await Promise.all([
    loadListResource({ key: "payments.tier-assignments" }),
    supabase
      .from("quality_tiers")
      .select("id, name")
      .eq("factory_id", profile.factory_id)
      .eq("active", true)
      .order("sort_order"),
  ]);
  if (!assignmentResource.ok) throw new Error(assignmentResource.error);
  if (tierError) throw new Error(friendlyError(tierError));

  const supplierOptions: TierSupplierOption[] = assignmentResource.rows.map((supplier) => ({
    id: supplier.id,
    name: supplier.supplierName,
    area: supplier.area,
  }));
  const tierOptions = (tiers ?? []) as TierOption[];

  return (
    <TierAssignmentsTable
      rows={assignmentResource.rows}
      suppliers={supplierOptions}
      tiers={tierOptions}
      canManage={MANAGEMENT_ROLES.includes(profile.role)}
    />
  );
}
