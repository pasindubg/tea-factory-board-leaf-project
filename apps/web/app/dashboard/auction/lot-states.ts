export const LOT_STATES = [
  "invoiced",
  "acknowledged",
  "pending",
  "missing",
  "shutout",
  "valued",
  "withdrawn",
  "re-print",
  "sold",
  "settled",
] as const;

export type LotState = (typeof LOT_STATES)[number];

export function isLotState(value: string): value is LotState {
  return (LOT_STATES as readonly string[]).includes(value);
}
