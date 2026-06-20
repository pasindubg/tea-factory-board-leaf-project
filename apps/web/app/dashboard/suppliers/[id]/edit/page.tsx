import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";
import { updateSupplier } from "../../actions";
import { SupplierForm } from "../../supplier-form";

export default async function EditSupplierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireProfile(getDefaultRoles("suppliers"));
  const { id } = await params;
  const { error } = await searchParams;

  const [{ data: supplier }, { data: collectors }] = await Promise.all([
    supabase
      .from("suppliers")
      .select("id, name, phone, nic_number, area, land_size_acres, collector_id")
      .eq("id", id)
      .single(),
    supabase.from("collectors").select("id, name").eq("active", true).order("name"),
  ]);
  if (!supplier) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Edit supplier</h1>
      <SupplierForm
        action={updateSupplier.bind(null, supplier.id)}
        collectors={collectors ?? []}
        values={{ ...supplier, land_size_acres: supplier.land_size_acres?.toString() ?? null }}
        submitLabel="Save changes"
        error={error}
      />
    </div>
  );
}
