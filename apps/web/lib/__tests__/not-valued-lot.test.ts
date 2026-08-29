import { describe, expect, it } from "vitest";
import { brokerSaleKey, isNotValuedLot, valuedBrokerSaleKeys } from "../../app/dashboard/auction/state-buckets";

// A lot is "not valued" when it is still `acknowledged` while the SAME broker's
// SAME sale has moved on to `valued` or `sold` — the valuation for that group
// came and went without it.
const BPML = "broker-bpml";
const ASIA = "broker-asia";

const at = (state: string, brokerId: string, saleNo: string) => ({ state, brokerId, saleNo });
const groupHas = (
  lots: { state: string; brokerId: string; saleNo: string }[],
  brokerId: string,
  saleNo: string,
) => valuedBrokerSaleKeys(lots).has(brokerSaleKey(brokerId, saleNo));

describe("isNotValuedLot", () => {
  it("flags an acknowledged lot once its broker+sale has been valued", () => {
    const lots = [at("valued", BPML, "0024")];
    expect(isNotValuedLot({ state: "acknowledged" }, groupHas(lots, BPML, "0024"))).toBe(true);
  });

  it("flags it when the group has gone all the way to sold", () => {
    const lots = [at("sold", BPML, "0024")];
    expect(isNotValuedLot({ state: "acknowledged" }, groupHas(lots, BPML, "0024"))).toBe(true);
  });

  it("stays quiet while the whole group is still acknowledged", () => {
    const lots = [at("acknowledged", BPML, "0024")];
    expect(isNotValuedLot({ state: "acknowledged" }, groupHas(lots, BPML, "0024"))).toBe(false);
  });

  it("does not borrow another broker's valuation in the same sale", () => {
    const lots = [at("valued", ASIA, "0024")];
    expect(isNotValuedLot({ state: "acknowledged" }, groupHas(lots, BPML, "0024"))).toBe(false);
  });

  it("does not borrow the same broker's valuation from another sale", () => {
    const lots = [at("valued", BPML, "0025")];
    expect(isNotValuedLot({ state: "acknowledged" }, groupHas(lots, BPML, "0024"))).toBe(false);
  });

  it("never flags a lot that was itself valued or sold", () => {
    const lots = [at("sold", BPML, "0024")];
    const valued = groupHas(lots, BPML, "0024");
    expect(isNotValuedLot({ state: "valued" }, valued)).toBe(false);
    expect(isNotValuedLot({ state: "sold" }, valued)).toBe(false);
  });

  it("never flags a lot still at invoiced — it was never acknowledged", () => {
    const lots = [at("valued", BPML, "0024")];
    expect(isNotValuedLot({ state: "invoiced" }, groupHas(lots, BPML, "0024"))).toBe(false);
  });

  it("clears itself once the contract sells the lot", () => {
    // The regression this rule replaces: a stored flag written at valuation
    // time stayed true after the sellers contract sold the very same lot, and
    // the sale page kept reporting it as Not Valued.
    const lots = [at("sold", BPML, "0024")];
    expect(isNotValuedLot({ state: "sold" }, groupHas(lots, BPML, "0024"))).toBe(false);
  });

  it("ignores leading zeros in the sale number, like every other group key", () => {
    const lots = [at("valued", BPML, "24")];
    expect(isNotValuedLot({ state: "acknowledged" }, groupHas(lots, BPML, "0024"))).toBe(true);
  });
});
