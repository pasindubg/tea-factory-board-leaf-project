export const LOT_STATES = ["invoiced", "acknowledged", "valued", "sold"] as const;

export type LotState = (typeof LOT_STATES)[number];

export function isLotState(value: string): value is LotState {
  return (LOT_STATES as readonly string[]).includes(value);
}

export const LOT_FLAGS = ["shutout", "unsold", "reprint", "withdrawn", "notValued", "missing", "settled"] as const;

export type LotFlag = (typeof LOT_FLAGS)[number];

export type LotFlags = Record<LotFlag, boolean>;

export const LOT_FLAG_LABEL: Record<LotFlag, string> = {
  shutout: "Shutout",
  unsold: "Un-sold",
  reprint: "Re-print",
  withdrawn: "Withdrawn",
  notValued: "Not valued",
  missing: "Missing",
  settled: "Settled",
};

export const LOT_FLAG_COLUMN: Record<LotFlag, string> = {
  shutout: "shutout",
  unsold: "unsold",
  reprint: "reprint",
  withdrawn: "withdrawn",
  notValued: "not_valued",
  missing: "missing",
  settled: "settled",
};

export function lotFlagsFromRow(row: Partial<Record<string, unknown>>): LotFlags {
  return {
    shutout: Boolean(row.shutout),
    unsold: Boolean(row.unsold),
    reprint: Boolean(row.reprint),
    withdrawn: Boolean(row.withdrawn),
    notValued: Boolean(row.not_valued ?? row.notValued),
    missing: Boolean(row.missing),
    settled: Boolean(row.settled),
  };
}

export function activeLotFlags(flags: Partial<LotFlags>): LotFlag[] {
  return LOT_FLAGS.filter((flag) => flags[flag]);
}
