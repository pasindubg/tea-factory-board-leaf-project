import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { sendMessage } from "./actions";

// Compose surface for factory → supplier messages (FA3, issue #13). Send to one
// supplier or broadcast to all; recent sends are listed below.

type SentRow = {
  id: string;
  title: string;
  body: string;
  supplier_id: string | null;
  sent_at: string;
  suppliers: { name: string } | null;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { supabase } = await requireModuleAccess("messages");
  const sp = await searchParams;

  const [{ data: suppliers }, { data: sentData }] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("active", true).order("name"),
    supabase
      .from("supplier_messages")
      .select("id, title, body, supplier_id, sent_at, suppliers(name)")
      .order("sent_at", { ascending: false })
      .limit(25),
  ]);
  const sent = (sentData ?? []) as unknown as SentRow[];
  const recipient = (r: SentRow) =>
    r.supplier_id ? (r.suppliers as unknown as { name: string } | null)?.name ?? "Supplier" : "All suppliers";

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Messages</h1>
        <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">
          Send a note to one supplier or broadcast to all. They see it in the field app.
        </p>
      </div>

      {sp.error && (
        <div className="rounded-md border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 px-4 py-3 text-sm text-red-800 dark:text-red-400">{sp.error}</div>
      )}
      {sp.notice && (
        <div className="rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-4 py-3 text-sm text-green-800 dark:text-green-400">{sp.notice}</div>
      )}

      <form action={sendMessage} className="space-y-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900 p-5">
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">To</label>
          <select
            name="target"
            defaultValue="all"
            className="w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm"
          >
            <option value="all">All suppliers (broadcast)</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Title</label>
          <input
            name="title"
            required
            maxLength={120}
            className="w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm"
            placeholder="e.g. Factory closed on Poya day"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-stone-700 dark:text-stone-300">Message</label>
          <textarea
            name="body"
            required
            rows={4}
            className="w-full rounded-md border border-stone-300 dark:border-stone-600 px-3 py-2 text-sm"
            placeholder="Write your message to suppliers…"
          />
        </div>
        <SubmitButton
          pendingText="Sending…"
          className="rounded-md bg-green-700 dark:bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:hover:bg-green-700"
        >
          Send
        </SubmitButton>
      </form>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500 dark:text-stone-400">Recent</h2>
        <div className="mt-3 divide-y divide-stone-100 dark:divide-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-900">
          {sent.map((m) => (
            <div key={m.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium">{m.title}</p>
                <span className="shrink-0 rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-xs text-stone-600 dark:text-stone-400">
                  {recipient(m)}
                </span>
              </div>
              <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">{m.body}</p>
              <p className="mt-1 text-xs text-stone-400 dark:text-stone-500">{new Date(m.sent_at).toLocaleString()}</p>
            </div>
          ))}
          {sent.length === 0 && <p className="px-4 py-8 text-center text-sm text-stone-400 dark:text-stone-500">No messages sent yet.</p>}
        </div>
      </section>
    </div>
  );
}
