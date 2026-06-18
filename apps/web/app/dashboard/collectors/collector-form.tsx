import { SubmitButton } from "@/components/submit-button";

type CollectorValues = {
  name?: string;
  phone?: string | null;
  nic_number?: string | null;
  area?: string | null;
};

const inputClass =
  "mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-green-600 focus:outline-none";

export function CollectorForm({
  action,
  values = {},
  submitLabel,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  values?: CollectorValues;
  submitLabel: string;
  error?: string;
}) {
  return (
    <form action={action} className="mt-6 max-w-lg space-y-4 rounded-xl border border-stone-200 bg-white p-6">
      {error && (
        <p className="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <label className="block text-sm font-medium">
        Name *
        <input name="name" required defaultValue={values.name ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Phone
        <input name="phone" defaultValue={values.phone ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        NIC number
        <input name="nic_number" defaultValue={values.nic_number ?? ""} className={inputClass} />
      </label>
      <label className="block text-sm font-medium">
        Area
        <input name="area" defaultValue={values.area ?? ""} className={inputClass} />
      </label>
      <div className="flex gap-3 pt-2">
        <SubmitButton
          pendingText="Saving…"
          className="rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800"
        >
          {submitLabel}
        </SubmitButton>
        <a href="/dashboard/collectors" className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100">
          Cancel
        </a>
      </div>
    </form>
  );
}
