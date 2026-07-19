import { describe, expect, it } from "vitest";
import { isListResourceKey, listResourceIdentity } from "./list-resources";
import { parseNoListParams, parsePaymentPeriodParams, parseUuidListParams, parseWeighingListParams } from "./list-resource-validation";

describe("framework list resource boundary", () => {
  it("recognizes only allowlisted opaque resource keys", () => {
    expect(isListResourceKey("auction.brokers")).toBe(true);
    expect(isListResourceKey("auction.dispatch-lots")).toBe(true);
    expect(isListResourceKey("auction.physical-dispatches")).toBe(true);
    expect(isListResourceKey("auction.eligible-broker-invoices")).toBe(true);
    expect(isListResourceKey("brokers")).toBe(false);
    expect(isListResourceKey("auction_bundled_dispatches")).toBe(false);
    expect(isListResourceKey("public.brokers")).toBe(false);
  });

  it.each(["factory_id", "user_id", "table", "cascade"])(
    "rejects injected %s on resources without parameters",
    (key) => {
      expect(parseNoListParams({ [key]: "attacker-controlled" })).toEqual({
        ok: false,
        error: "This list does not accept parameters.",
      });
    },
  );

  it("requires one well-formed UUID parent parameter", () => {
    const saleId = "123e4567-e89b-42d3-a456-426614174000";
    expect(parseUuidListParams({ saleId }, "saleId")).toEqual({ ok: true, value: { saleId } });
    expect(parseUuidListParams({ saleId: "sale-1" }, "saleId").ok).toBe(false);
    expect(parseUuidListParams({ saleId, factory_id: "other" }, "saleId").ok).toBe(false);
  });

  it("builds a stable exact subscription identity", () => {
    expect(listResourceIdentity({ key: "auction.sale-lines", params: { saleId: "123e4567-e89b-42d3-a456-426614174000" } }))
      .toBe("auction.sale-lines?saleId=123e4567-e89b-42d3-a456-426614174000");
    expect(listResourceIdentity({ key: "auction.dispatch-lots", params: { saleId: "123e4567-e89b-42d3-a456-426614174000" } }))
      .toBe("auction.dispatch-lots?saleId=123e4567-e89b-42d3-a456-426614174000");
  });

  it("accepts only a bounded numeric payment period", () => {
    expect(parsePaymentPeriodParams({ year: 2026, month: 7 })).toEqual({
      ok: true,
      value: { year: 2026, month: 7 },
    });
    expect(parsePaymentPeriodParams({ year: 2026, month: 13 }).ok).toBe(false);
    expect(parsePaymentPeriodParams({ year: 2026, month: 7, factory_id: "other" }).ok).toBe(false);
    expect(parsePaymentPeriodParams({ year: "2026", month: 7 }).ok).toBe(false);
  });

  it("allows only validated weighing filters", () => {
    const supplierId = "123e4567-e89b-42d3-a456-426614174000";
    expect(parseWeighingListParams({ from: "2026-07-01", to: "2026-07-31", supplierId })).toEqual({
      ok: true,
      value: { from: "2026-07-01", to: "2026-07-31", supplierId },
    });
    expect(parseWeighingListParams({ factory_id: "other" }).ok).toBe(false);
    expect(parseWeighingListParams({ from: "2026-7-1" }).ok).toBe(false);
    expect(parseWeighingListParams({ collectorId: "collector-1" }).ok).toBe(false);
  });
});
