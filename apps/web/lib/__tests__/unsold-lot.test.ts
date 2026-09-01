import { describe, expect, it } from "vitest";
import { brokerSaleKey, isUnsoldLot, soldBrokerSaleKeys } from "../../app/dashboard/auction/state-buckets";

// A lot is un-sold when it is still `valued` while the SAME broker has sold
// something in the SAME sale. The broker's contract settles that sale for it,
// so anything left at `valued` was offered and not bought.
const BPML = "broker-bpml";
const ASIA = "broker-asia";

const lot = (state: string, unsold = false) => ({ state, unsold });
const sold = (brokerId: string, saleNo: string) => ({ state: "sold", brokerId, saleNo });

describe("isUnsoldLot", () => {
  it("marks a valued lot un-sold when its broker sold something in the same sale", () => {
    const groups = soldBrokerSaleKeys([sold(BPML, "0024")]);
    expect(isUnsoldLot(lot("valued"), groups.has(brokerSaleKey(BPML, "0024")))).toBe(true);
  });

  it("still marks it un-sold when the sold lot is on a DIFFERENT invoice of that broker", () => {
    // Both invoices carry the same broker and sale, which is the whole point of
    // keying on broker+sale rather than on the dispatch invoice id.
    const groups = soldBrokerSaleKeys([sold(BPML, "0024")]);
    expect(groups.has(brokerSaleKey(BPML, "0024"))).toBe(true);
  });

  it("ignores a sale sold by a DIFFERENT broker", () => {
    const groups = soldBrokerSaleKeys([sold(ASIA, "0024")]);
    expect(isUnsoldLot(lot("valued"), groups.has(brokerSaleKey(BPML, "0024")))).toBe(false);
  });

  it("ignores the same broker selling in a DIFFERENT sale", () => {
    const groups = soldBrokerSaleKeys([sold(BPML, "0023")]);
    expect(isUnsoldLot(lot("valued"), groups.has(brokerSaleKey(BPML, "0024")))).toBe(false);
  });

  it("leaves a lot that was never valued alone", () => {
    const groups = soldBrokerSaleKeys([sold(BPML, "0024")]);
    const sameGroup = groups.has(brokerSaleKey(BPML, "0024"));
    expect(isUnsoldLot(lot("acknowledged"), sameGroup)).toBe(false);
    expect(isUnsoldLot(lot("invoiced"), sameGroup)).toBe(false);
    expect(isUnsoldLot(lot("sold"), sameGroup)).toBe(false);
  });

  it("honours the stored flag even when nothing in the sale sold", () => {
    // The sellers contract wrote it because the document said NOT SOLD — which
    // is also the case where no sold sibling can exist to prove it.
    expect(isUnsoldLot(lot("valued", true), false)).toBe(true);
  });

  it("says nothing yet while the sale is still open", () => {
    expect(isUnsoldLot(lot("valued"), false)).toBe(false);
  });
});

describe("brokerSaleKey", () => {
  it("treats every spelling of a sale number as the same group", () => {
    expect(brokerSaleKey(BPML, "21")).toBe(brokerSaleKey(BPML, "0021"));
    expect(brokerSaleKey(BPML, "021")).toBe(brokerSaleKey(BPML, "0021"));
  });

  it("keeps different brokers and different sales apart", () => {
    expect(brokerSaleKey(BPML, "0021")).not.toBe(brokerSaleKey(ASIA, "0021"));
    expect(brokerSaleKey(BPML, "0021")).not.toBe(brokerSaleKey(BPML, "0022"));
  });
});
