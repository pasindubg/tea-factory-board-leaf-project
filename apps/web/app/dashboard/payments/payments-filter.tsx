"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { MONTHS } from "@/lib/money";

const inputClass = "rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm focus:border-green-600 dark:focus:border-green-500 focus:outline-none";

export function PaymentsFilter({ year, month }: { year: number; month: number }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const now = new Date();
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() =>
      router.push(`/dashboard/payments?year=${fd.get("year")}&month=${fd.get("month")}`)
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <label className="text-sm">
        Month
        <select name="month" defaultValue={month} className={`${inputClass} mt-1 block`}>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1}>{m}</option>
          ))}
        </select>
      </label>
      <label className="text-sm">
        Year
        <select name="year" defaultValue={year} className={`${inputClass} mt-1 block`}>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </label>
      <button
        disabled={isPending}
        className="rounded-md border border-stone-300 dark:border-stone-600 px-4 py-1.5 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isPending ? "Loading…" : "View"}
      </button>
    </form>
  );
}
