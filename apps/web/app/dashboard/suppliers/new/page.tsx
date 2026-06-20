import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";
import { createSupplier } from "../actions";
import { SupplierForm } from "../supplier-form";

export default async function NewSupplierPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireProfile(getDefaultRoles("suppliers"));
  const { error } = await searchParams;
  const { data: collectors } = await supabase
    .from("collectors")
    .select("id, name")
    .eq("active", true)
    .order("name");

  return (
    <div>
      <h1 className="text-2xl font-semibold">Add supplier</h1>
      <SupplierForm action={createSupplier} collectors={collectors ?? []} submitLabel="Add supplier" error={error} />
    </div>
  );
}
