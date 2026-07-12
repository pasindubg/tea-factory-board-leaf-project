import { requireModuleAccess } from "@/lib/profile";
import { SubmitButton } from "@/components/submit-button";
import { createAuctionGrade } from "../actions";
import { GradesTable, type GradeTableRow } from "./grades-table";
import { ThresholdsTable, type ThresholdTableRow } from "./thresholds-table";

const input = "mt-1 w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm dark:border-stone-600 dark:bg-stone-900";
const label = "block text-sm font-medium text-stone-600 dark:text-stone-400";
const addBtn = "rounded-md bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-800 dark:bg-green-600 dark:hover:bg-green-700";

type BrokerRow = { id: string; name: string };
type GradeRow = { id: string; code: string; name: string; active: boolean; sort_order: number | null };
type GradeAliasRow = { id: string; grade_id: string; alias: string };
type ThresholdRow = {
  id: string;
  broker_id: string;
  grade_id: string;
  min_net_kg: string | number;
  applies: boolean;
};

export default async function AuctionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { supabase, profile } = await requireModuleAccess("auction");
  const isOwner = profile.role === "owner";
  const { error } = await searchParams;

  const [{ data: brokers }, { data: grades }, { data: gradeAliases }, { data: thresholds }] = await Promise.all([
    supabase.from("brokers").select("id, name").order("name"),
    supabase.from("auction_grades").select("id, code, name, active, sort_order").order("sort_order").order("code"),
    supabase.from("auction_grade_aliases").select("id, grade_id, alias").order("alias"),
    supabase.from("broker_grade_thresholds").select("id, broker_id, grade_id, min_net_kg, applies"),
  ]);

  const brokerRows = (brokers ?? []) as BrokerRow[];
  const gradeRows = (grades ?? []) as GradeRow[];
  const aliasRows = (gradeAliases ?? []) as GradeAliasRow[];
  const thresholdRows = (thresholds ?? []) as ThresholdRow[];
  const thresholdByPair = new Map(thresholdRows.map((row) => [`${row.broker_id}:${row.grade_id}`, row]));
  const aliasesByGrade = new Map<string, string[]>();
  for (const alias of aliasRows) {
    aliasesByGrade.set(alias.grade_id, [...(aliasesByGrade.get(alias.grade_id) ?? []), alias.alias]);
  }
  const activeGrades = gradeRows.filter((grade) => grade.active);

  const gradeTableRows: GradeTableRow[] = gradeRows.map((g) => ({
    id: g.id,
    code: g.code,
    name: g.name,
    active: g.active,
    sortOrder: g.sort_order ?? 0,
    aliases: aliasesByGrade.get(g.id) ?? [],
  }));

  const thresholdTableRows: ThresholdTableRow[] = brokerRows.flatMap((broker) =>
    activeGrades.map((grade) => {
      const threshold = thresholdByPair.get(`${broker.id}:${grade.id}`);
      return {
        key: `${broker.id}:${grade.id}`,
        brokerId: broker.id,
        brokerName: broker.name,
        gradeId: grade.id,
        gradeCode: grade.code,
        minNetKg: threshold ? Number(threshold.min_net_kg) : 0,
        applies: threshold?.applies ?? false,
      };
    }),
  );

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">{error}</p>}

      <section>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Tea grades</h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">Factory grade set used when dispatch lots are entered.</p>
          </div>
        </div>

        <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <GradesTable rows={gradeTableRows} isOwner={isOwner} />

          {isOwner ? (
            <form action={createAuctionGrade} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
              <div>
                <label className={label}>Grade code</label>
                <input name="code" required placeholder="OPA" className={input} />
              </div>
              <div>
                <label className={label}>Display name</label>
                <input name="name" placeholder="OPA" className={input} />
              </div>
              <div>
                <label className={label}>Sort order</label>
                <input name="sort_order" type="number" step="1" min="0" placeholder="30" className={input} />
              </div>
              <div>
                <label className={label}>Aliases</label>
                <input name="aliases" placeholder="PEK, PEKOE" className={input} />
              </div>
              <SubmitButton pendingText="Adding..." className={addBtn}>
                Add grade
              </SubmitButton>
            </form>
          ) : (
            <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-500 dark:border-stone-700 dark:bg-stone-800/50 dark:text-stone-400">
              Only the factory owner can add grades.
            </p>
          )}
        </div>
      </section>

      <section>
        <div>
          <h2 className="text-lg font-medium text-stone-700 dark:text-stone-300">Broker min-kg shutout thresholds</h2>
          <p className="text-sm text-stone-500 dark:text-stone-400">
            Applied thresholds mark factory-entered lots as shutout immediately when net kg is below the broker/grade rule.
          </p>
        </div>

        <div className="mt-4">
          <ThresholdsTable rows={thresholdTableRows} isOwner={isOwner} />
        </div>
      </section>
    </div>
  );
}
