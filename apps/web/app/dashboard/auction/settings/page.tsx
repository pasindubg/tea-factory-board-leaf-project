import { requireModuleAccess } from "@/lib/profile";
import { loadListResource } from "@/lib/list-resource-registry";
import { GradesTable, type GradeTableRow } from "./grades-table";
import { ThresholdsTable, type ThresholdTableRow } from "./thresholds-table";
import { EntityListTabs } from "@/components/entity-list";

export default async function AuctionSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { profile } = await requireModuleAccess("auction");
  const isOwner = profile.role === "owner";
  const { error } = await searchParams;

  const [grades, thresholds] = await Promise.all([
    loadListResource({ key: "auction.grades" }),
    loadListResource({ key: "auction.broker-grade-thresholds" }),
  ]);
  if (!grades.ok) throw new Error(grades.error);
  if (!thresholds.ok) throw new Error(thresholds.error);

  const gradeTableRows: GradeTableRow[] = grades.rows;
  const thresholdTableRows: ThresholdTableRow[] = thresholds.rows;

  return (
    <div className="space-y-8">
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950 dark:text-red-400">{error}</p>}

      <EntityListTabs
        label="Auction setup lists"
        tabs={[
          { id: "grades", label: "Tea grades", count: String(gradeTableRows.length), content: <GradesTable rows={gradeTableRows} isOwner={isOwner} /> },
          { id: "thresholds", label: "Broker thresholds", count: String(thresholdTableRows.length), content: <ThresholdsTable rows={thresholdTableRows} isOwner={isOwner} /> },
        ]}
      />
    </div>
  );
}
