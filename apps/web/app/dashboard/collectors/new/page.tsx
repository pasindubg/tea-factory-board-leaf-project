import { createCollector } from "../actions";
import { CollectorForm } from "../collector-form";

export default async function NewCollectorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <h1 className="text-2xl font-semibold">Add collector</h1>
      <CollectorForm action={createCollector} submitLabel="Add collector" error={error} />
    </div>
  );
}
