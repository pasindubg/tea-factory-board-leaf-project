import { notFound } from "next/navigation";
import { requireProfile } from "@/lib/profile";
import { getDefaultRoles } from "@/lib/roles";
import { updateCollector } from "../../actions";
import { CollectorForm } from "../../collector-form";

export default async function EditCollectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase } = await requireProfile(getDefaultRoles("collectors"));
  const { id } = await params;
  const { error } = await searchParams;

  const { data: collector } = await supabase
    .from("collectors")
    .select("id, name, phone, nic_number, area")
    .eq("id", id)
    .single();
  if (!collector) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold">Edit collector</h1>
      <CollectorForm
        action={updateCollector.bind(null, collector.id)}
        values={collector}
        submitLabel="Save changes"
        error={error}
      />
    </div>
  );
}
