"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

const inputClass = "rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-green-600 focus:outline-none";

type Option = { id: string; name: string };

export function WeighingsFilter({
  from, to, supplierId, collectorId, suppliers, collectors, isCollector,
}: {
  from?: string; to?: string; supplierId?: string; collectorId?: string;
  suppliers: Option[]; collectors: Option[]; isCollector: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const params = new URLSearchParams();
    const f = fd.get("from") as string;
    const t = fd.get("to") as string;
    const s = fd.get("supplier") as string;
    const c = fd.get("collector") as string;
    if (f) params.set("from", f);
    if (t) params.set("to", t);
    if (s) params.set("supplier", s);
    if (c) params.set("collector", c);
    const qs = params.toString();
    startTransition(() => router.push(`/dashboard/weighings${qs ? `?${qs}` : ""}`));
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 flex flex-wrap items-end gap-3">
      <label className="text-sm">
        From
        <input type="date" name="from" defaultValue={from ?? ""} className={`${inputClass} mt-1 block`} />
      </label>
      <label className="text-sm">
        To
        <input type="date" name="to" defaultValue={to ?? ""} className={`${inputClass} mt-1 block`} />
      </label>
      <label className="text-sm">
        Supplier
        <select name="supplier" defaultValue={supplierId ?? ""} className={`${inputClass} mt-1 block`}>
          <option value="">All suppliers</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </label>
      {!isCollector && (
        <label className="text-sm">
          Collector
          <select name="collector" defaultValue={collectorId ?? ""} className={`${inputClass} mt-1 block`}>
            <option value="">All collectors</option>
            {collectors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
      )}
      <button
        disabled={isPending}
        className="rounded-md border border-stone-300 px-4 py-1.5 text-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Loading…" : "Filter"}
      </button>
      <a href="/dashboard/weighings" className="text-sm text-stone-500 hover:underline">
        Clear
      </a>
    </form>
  );
}
