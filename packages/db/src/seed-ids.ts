// Fixed IDs used by seed.ts and verify-rls.ts. Kept side-effect-free so
// importing them never triggers the seed itself.
export const SEED_IDS = {
  factoryA: "aaaaaaaa-0000-0000-0000-000000000001",
  factoryB: "bbbbbbbb-0000-0000-0000-000000000001",
  ownerA: "aaaaaaaa-0000-0000-0000-000000000011",
  collectorUserA: "aaaaaaaa-0000-0000-0000-000000000012",
  ownerB: "bbbbbbbb-0000-0000-0000-000000000011",
  collectorUserB: "bbbbbbbb-0000-0000-0000-000000000012",
} as const;
