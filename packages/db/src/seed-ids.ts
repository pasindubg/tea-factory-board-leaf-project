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

// Username/password logins for the seeded users. seed.ts writes the usernames
// (public.users.username is what get_email_for_login resolves) and
// link-auth-users.ts sets the matching Supabase Auth password, so a re-seed or
// a local `supabase db reset` restores a working login instead of silently
// leaving one half of the pair behind.
export const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "TempOwner#2026";

export const SEED_LOGINS = [
  { email: "owner-a@example.com", username: "owner.a", seedId: SEED_IDS.ownerA },
  { email: "collector-a@example.com", username: "collector.a", seedId: SEED_IDS.collectorUserA },
  { email: "owner-b@example.com", username: "owner.b", seedId: SEED_IDS.ownerB },
  { email: "collector-b@example.com", username: "collector.b", seedId: SEED_IDS.collectorUserB },
] as const;
