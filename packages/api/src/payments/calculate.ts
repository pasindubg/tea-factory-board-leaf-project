// Pure payment-calculation engine — no DB, no I/O, fully unit-testable.
// The web server action maps Supabase rows onto these inputs and persists the
// returned statement (header + lines). Keeping it pure is what lets the M6
// fixture test hand-verify totals to the cent.
//
// Money model (LKR):
//   leaf  = Σ kg × base green-leaf rate effective at each weighing's date
//   bonus = Σ kg × quality-tier bonus effective at each weighing's date
//           (flat = LKR/kg; percent = % of that weighing's base rate)
//   gross = leaf + bonus
//   net   = gross − deductions (transport, water penalty, advances, other)
//                 + one-off positive adjustments (kind "bonus")
//   bonusMissed = what the factory's TOP tier would have added on top of what
//                 the supplier actually earned — the motivational figure.

export type RatePeriod = {
  pricePerKg: number;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null; // null = open-ended
};

export type Tier = {
  id: string;
  name: string;
  bonusKind: "flat" | "percent";
  bonusValue: number;
  sortOrder: number; // higher = better tier
};

export type TierAssignment = {
  tierId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
};

export type WeighingInput = {
  weightKg: number;
  collectedAt: string; // ISO timestamp
};

export type AdjustmentInput = {
  kind: "advance" | "transport" | "water_penalty" | "other" | "bonus";
  label: string | null;
  amount: number | null; // flat LKR magnitude
  percent: number | null; // % of gross (used by water_penalty)
};

export type CalcInput = {
  weighings: WeighingInput[];
  baseRates: RatePeriod[]; // GREEN_LEAF rate history
  tiers: Tier[]; // factory's tier catalog (for bonus lookup + top-tier)
  assignments: TierAssignment[]; // this supplier's tier history
  adjustments: AdjustmentInput[];
  transportPerKg: number; // factory default; 0 = none
};

export type StatementLine = {
  lineType: "leaf" | "bonus" | "transport" | "water_penalty" | "advance" | "other";
  label: string | null;
  quantity: number | null; // kg, where applicable
  rate: number | null; // per-kg rate, where applicable
  amount: number; // signed LKR (positive adds, negative deducts), rounded to cents
  sortOrder: number;
};

export type Statement = {
  totalKg: number;
  grossAmount: number;
  bonusAmount: number;
  bonusMissed: number;
  deductionAmount: number; // positive magnitude of all deductions
  netAmount: number;
  lines: StatementLine[];
  warnings: string[];
};

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dateOf = (iso: string) => iso.slice(0, 10);

function effectiveAt<T extends { effectiveFrom: string; effectiveTo: string | null }>(
  periods: T[],
  day: string,
): T | undefined {
  return periods.find(
    (p) => p.effectiveFrom <= day && (p.effectiveTo === null || day <= p.effectiveTo),
  );
}

function bonusPerKg(tier: Tier | undefined, baseRate: number): number {
  if (!tier) return 0;
  return tier.bonusKind === "flat" ? tier.bonusValue : (baseRate * tier.bonusValue) / 100;
}

export function computeStatement(input: CalcInput): Statement {
  const { weighings, baseRates, tiers, assignments, adjustments, transportPerKg } = input;
  const warnings: string[] = [];

  const topTier = [...tiers].sort((a, b) => b.sortOrder - a.sortOrder)[0];
  const tierById = new Map(tiers.map((t) => [t.id, t]));

  // Group weighings by (base rate, tier) so the statement shows an auditable
  // line per pricing combination — this is also what a mid-month rate or tier
  // change produces (multiple groups).
  type Group = { baseRate: number; tier: Tier | undefined; kg: number };
  const groups = new Map<string, Group>();
  let totalKg = 0;
  let bonusMissed = 0;

  for (const w of weighings) {
    const day = dateOf(w.collectedAt);
    const ratePeriod = effectiveAt(baseRates, day);
    if (!ratePeriod) {
      warnings.push(`No base rate effective on ${day} — ${w.weightKg} kg left unpaid.`);
    }
    const baseRate = ratePeriod?.pricePerKg ?? 0;
    const assignment = effectiveAt(assignments, day);
    const tier = assignment ? tierById.get(assignment.tierId) : undefined;

    totalKg += w.weightKg;

    const key = `${baseRate}|${tier?.id ?? "none"}`;
    const g = groups.get(key) ?? { baseRate, tier, kg: 0 };
    g.kg += w.weightKg;
    groups.set(key, g);

    // What the top tier would have added vs what this weighing actually earned.
    const earned = bonusPerKg(tier, baseRate);
    const best = bonusPerKg(topTier, baseRate);
    bonusMissed += Math.max(0, (best - earned) * w.weightKg);
  }

  const lines: StatementLine[] = [];
  let leafAmount = 0;
  let bonusAmount = 0;

  // Stable order: by base rate then tier rank.
  const ordered = [...groups.values()].sort(
    (a, b) => a.baseRate - b.baseRate || (a.tier?.sortOrder ?? 0) - (b.tier?.sortOrder ?? 0),
  );
  for (const g of ordered) {
    const leaf = round2(g.kg * g.baseRate);
    leafAmount += leaf;
    lines.push({
      lineType: "leaf",
      label: g.tier ? `Green leaf — ${g.tier.name}` : "Green leaf",
      quantity: round2(g.kg),
      rate: round2(g.baseRate),
      amount: leaf,
      sortOrder: 10,
    });
    const bpk = bonusPerKg(g.tier, g.baseRate);
    if (bpk > 0) {
      const bonus = round2(g.kg * bpk);
      bonusAmount += bonus;
      lines.push({
        lineType: "bonus",
        label: `${g.tier!.name} bonus`,
        quantity: round2(g.kg),
        rate: round2(bpk),
        amount: bonus,
        sortOrder: 20,
      });
    }
  }

  const grossAmount = round2(leafAmount + bonusAmount);

  // Deductions + positive one-offs.
  let deductionAmount = 0;
  let positiveAdj = 0;

  if (transportPerKg > 0 && totalKg > 0) {
    const amt = round2(totalKg * transportPerKg);
    deductionAmount += amt;
    lines.push({
      lineType: "transport",
      label: "Transport",
      quantity: round2(totalKg),
      rate: round2(transportPerKg),
      amount: -amt,
      sortOrder: 30,
    });
  }

  const lineTypeFor = (kind: AdjustmentInput["kind"]): StatementLine["lineType"] =>
    kind === "advance" ? "advance" : kind === "water_penalty" ? "water_penalty" : kind === "transport" ? "transport" : "other";

  for (const adj of adjustments) {
    const magnitude =
      adj.percent != null ? round2((grossAmount * adj.percent) / 100) : round2(adj.amount ?? 0);
    if (magnitude === 0) continue;

    if (adj.kind === "bonus") {
      positiveAdj += magnitude;
      lines.push({
        lineType: "other",
        label: adj.label ?? "Bonus",
        quantity: null,
        rate: null,
        amount: magnitude,
        sortOrder: 25,
      });
    } else {
      deductionAmount += magnitude;
      lines.push({
        lineType: lineTypeFor(adj.kind),
        label: adj.label ?? defaultLabel(adj.kind),
        quantity: null,
        rate: adj.percent != null ? null : null,
        amount: -magnitude,
        sortOrder: 40,
      });
    }
  }

  const netAmount = round2(grossAmount + positiveAdj - deductionAmount);

  return {
    totalKg: round2(totalKg),
    grossAmount,
    bonusAmount: round2(bonusAmount),
    bonusMissed: round2(bonusMissed),
    deductionAmount: round2(deductionAmount),
    netAmount,
    lines: lines.sort((a, b) => a.sortOrder - b.sortOrder),
    warnings,
  };
}

function defaultLabel(kind: AdjustmentInput["kind"]): string {
  switch (kind) {
    case "advance":
      return "Advance recovery";
    case "transport":
      return "Transport";
    case "water_penalty":
      return "Water penalty";
    default:
      return "Deduction";
  }
}
