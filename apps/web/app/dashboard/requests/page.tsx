import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { approveRequest, declineRequest, handToDriver } from "./actions";

// Web review surface for supplier requests raised from the field app (issue #13).
// Four lanes follow the status machine: pending → approved → handed_to_driver →
// acknowledged. The "handed, not acknowledged" lane is the trust signal — cash
// the driver was given that the supplier hasn't confirmed receiving.

type Row = {
  id: string;
  supplier_id: string;
  type_key: string;
  amount: string | null;
  status: string;
  note: string | null;
  requested_at: string;
  handed_at: string | null;
  suppliers: { name: string } | null;
};

const fmtAmount = (a: string | null) =>
  a != null ? `LKR ${Number(a).toLocaleString("en-LK", { minimumFractionDigits: 2 })}` : "—";
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");

export default async function RequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase } = await requireModuleAccess("requests");
  const sp = await searchParams;

  const [{ data: requestsData }, { data: typesData }] = await Promise.all([
    supabase
      .from("supplier_requests")
      .select("id, supplier_id, type_key, amount, status, note, requested_at, handed_at, suppliers(name)")
      .order("requested_at", { ascending: false }),
    supabase.from("request_types").select("key, label"),
  ]);

  const labelByKey = new Map((typesData ?? []).map((t) => [t.key as string, t.label as string]));
  const typeLabel = (key: string) => labelByKey.get(key) ?? key;
  const requests = (requestsData ?? []) as unknown as Row[];
  const supplierName = (r: Row) => (r.suppliers as unknown as { name: string } | null)?.name ?? "—";

  const pending = requests.filter((r) => r.status === "pending");
  const approved = requests.filter((r) => r.status === "approved");
  const handed = requests.filter((r) => r.status === "handed_to_driver");
  const history = requests
    .filter((r) => ["acknowledged", "declined", "cancelled"].includes(r.status))
    .slice(0, 20);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Supplier requests</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Advances, fertiliser and tea-packet requests raised by suppliers from the field app.
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-400">{sp.error}</div>
      )}
      {sp.notice && (
        <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3 text-sm text-green-800 dark:text-green-400">
          {sp.notice}
        </div>
      )}

      {/* ⚠ Handed to driver but not acknowledged — the driver-didn't-deliver signal */}
      {handed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
            ⚠ Handed to driver — awaiting supplier acknowledgement ({handed.length})
          </h2>
          <div className="mt-3 space-y-2">
            {handed.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-4 py-3"
              >
                <div>
                  <p className="font-medium">
                    {supplierName(r)} — {typeLabel(r.type_key)} · {fmtAmount(r.amount)}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    Handed {fmtDate(r.handed_at)}. The supplier has not confirmed receipt on their app yet.
                  </p>
                </div>
                <span className="rounded-full bg-amber-200 dark:bg-amber-800 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-400">
                  unacknowledged
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Pending — approve / decline */}
      <Section title={`Pending (${pending.length})`}>
        {pending.length === 0 ? (
          <Empty>No pending requests.</Empty>
        ) : (
          pending.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <RequestSummary supplier={supplierName(r)} type={typeLabel(r.type_key)} amount={fmtAmount(r.amount)} note={r.note} when={r.requested_at} />
              <div className="flex gap-2">
                <form action={approveRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton
                    pendingText="…"
                    className="rounded-md bg-green-700 dark:bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
                  >
                    Approve
                  </SubmitButton>
                </form>
                <form action={declineRequest}>
                  <input type="hidden" name="id" value={r.id} />
                  <SubmitButton pendingText="…" className="rounded-md border border-stone-300 dark:border-stone-600 px-3 py-1.5 text-sm text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
                    Decline
                  </SubmitButton>
                </form>
              </div>
            </div>
          ))
        )}
      </Section>

      {/* Approved — mark handed to driver */}
      <Section title={`Approved — to hand over (${approved.length})`}>
        {approved.length === 0 ? (
          <Empty>Nothing approved awaiting handover.</Empty>
        ) : (
          approved.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <RequestSummary supplier={supplierName(r)} type={typeLabel(r.type_key)} amount={fmtAmount(r.amount)} note={r.note} when={r.requested_at} />
              <form action={handToDriver}>
                <input type="hidden" name="id" value={r.id} />
                <SubmitButton pendingText="…" className="rounded-md bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-900 dark:hover:bg-stone-700">
                  Mark handed to driver
                </SubmitButton>
              </form>
            </div>
          ))
        )}
      </Section>

      {/* History */}
      <Section title="Recent">
        {history.length === 0 ? (
          <Empty>No completed requests yet.</Empty>
        ) : (
          history.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <RequestSummary supplier={supplierName(r)} type={typeLabel(r.type_key)} amount={fmtAmount(r.amount)} note={r.note} when={r.requested_at} />
              <StatusBadge status={r.status} />
            </div>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">{title}</h2>
      <div className="mt-3 divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">{children}</p>;
}

function RequestSummary({
  supplier,
  type,
  amount,
  note,
  when,
}: {
  supplier: string;
  type: string;
  amount: string;
  note: string | null;
  when: string;
}) {
  return (
    <div>
      <p className="font-medium">
        {supplier} — {type} · {amount}
      </p>
      <p className="text-xs text-stone-500 dark:text-stone-400">
        Requested {new Date(when).toLocaleString()}
        {note ? ` · "${note}"` : ""}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    acknowledged: "bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-400",
    declined: "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400",
    cancelled: "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status] ?? "bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400"}`}>
      {status}
    </span>
  );
}
