"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { showAppToast } from "@/components/action-feedback";
import { setPaymentStatus } from "../actions";

type StatementStatusContextValue = {
  paid: boolean;
  paidAt: string | null;
  pending: boolean;
  toggle: () => Promise<void>;
};

const StatementStatusContext = createContext<StatementStatusContextValue | null>(null);

export function StatementStatusProvider({
  paymentId,
  initialPaid,
  initialPaidAt,
  children,
}: {
  paymentId: string;
  initialPaid: boolean;
  initialPaidAt: string | null;
  children: ReactNode;
}) {
  const [paid, setPaid] = useState(initialPaid);
  const [paidAt, setPaidAt] = useState(initialPaidAt);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending) return;
    setPending(true);
    try {
      const formData = new FormData();
      formData.set("payment_id", paymentId);
      formData.set("paid", String(!paid));
      const result = await setPaymentStatus(formData);
      if (!result.ok) {
        showAppToast(result.error, "error");
        return;
      }
      const nextPaid = !paid;
      setPaid(nextPaid);
      setPaidAt(nextPaid ? new Date().toISOString() : null);
      showAppToast(result.notice ?? "Statement status updated.");
    } catch {
      showAppToast("The statement status could not be updated. Please try again.", "error");
    } finally {
      setPending(false);
    }
  }

  return (
    <StatementStatusContext.Provider value={{ paid, paidAt, pending, toggle }}>
      {children}
    </StatementStatusContext.Provider>
  );
}

function useStatementStatus() {
  const context = useContext(StatementStatusContext);
  if (!context) throw new Error("Statement status controls must be inside StatementStatusProvider.");
  return context;
}

export function StatementStatusButton() {
  const { paid, pending, toggle } = useStatementStatus();
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      data-action-feedback-ignore
      className="rounded-md border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-600 dark:hover:bg-stone-800"
    >
      {pending ? "Updating…" : paid ? "Mark pending" : "Mark paid"}
    </button>
  );
}

export function StatementStatusBadge() {
  const { paid } = useStatementStatus();
  return (
    <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium ${paid ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-400" : "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-400"}`}>
      {paid ? "paid" : "pending"}
    </span>
  );
}

export function StatementGeneratedMeta({ generatedAt }: { generatedAt: string }) {
  const { paidAt } = useStatementStatus();
  return (
    <span suppressHydrationWarning>
      Generated {new Date(generatedAt).toLocaleString()}{paidAt ? ` · Paid ${new Date(paidAt).toLocaleString()}` : ""}
    </span>
  );
}
