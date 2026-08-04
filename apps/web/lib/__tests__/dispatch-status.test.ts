import { describe, expect, it } from "vitest";
import {
  canMarkDispatched,
  canRecordDispatchGrn,
  deriveDispatchStatus,
} from "../../app/dashboard/auction/dispatch-status";

const NOT_DISPATCHED = null;
const DISPATCHED = "2026-05-07T04:30:00Z";

describe("deriveDispatchStatus", () => {
  it("stays draft until the dispatcher marks it", () => {
    expect(deriveDispatchStatus(["draft", "invoiced"], NOT_DISPATCHED)).toBe("draft");
  });

  it("reports dispatched once marked, while invoices are still in progress", () => {
    expect(deriveDispatchStatus(["draft", "invoiced"], DISPATCHED)).toBe("dispatched");
  });

  it("becomes received only when EVERY invoice has reached GRN", () => {
    expect(deriveDispatchStatus(["grn", "invoiced"], DISPATCHED)).toBe("dispatched");
    expect(deriveDispatchStatus(["grn", "grn"], DISPATCHED)).toBe("received");
  });

  it("becomes catalogued only when EVERY invoice is acknowledged", () => {
    expect(deriveDispatchStatus(["catalogued", "grn"], DISPATCHED)).toBe("received");
    expect(deriveDispatchStatus(["catalogued", "catalogued"], DISPATCHED)).toBe("catalogued");
  });

  it("treats statuses beyond catalogued as having passed both thresholds", () => {
    // A sold or settled invoice obviously cleared GRN and cataloguing.
    expect(deriveDispatchStatus(["sold", "catalogued"], DISPATCHED)).toBe("catalogued");
    expect(deriveDispatchStatus(["settled", "valued"], DISPATCHED)).toBe("catalogued");
    expect(deriveDispatchStatus(["broker_statement"], DISPATCHED)).toBe("catalogued");
  });

  it("falls back to dispatched — not draft — when a new invoice joins a finished dispatch", () => {
    // The lorry did leave; adding paperwork afterwards does not un-dispatch it.
    expect(deriveDispatchStatus(["catalogued", "draft"], DISPATCHED)).toBe("dispatched");
  });

  it("never advances an empty dispatch past its manual state", () => {
    // every() is vacuously true on an empty list, which would otherwise report
    // a dispatch holding no invoices as fully catalogued.
    expect(deriveDispatchStatus([], NOT_DISPATCHED)).toBe("draft");
    expect(deriveDispatchStatus([], DISPATCHED)).toBe("dispatched");
  });

  it("advances on GRN even if the dispatcher never pressed the button", () => {
    // Derived stages do not depend on the manual one having happened.
    expect(deriveDispatchStatus(["grn", "grn"], NOT_DISPATCHED)).toBe("received");
  });

  it("treats the legacy 'dispatched' invoice status as an unconfirmed draft", () => {
    expect(deriveDispatchStatus(["dispatched", "dispatched"], DISPATCHED)).toBe("dispatched");
  });

  it("is stable when applied to its own result", () => {
    const statuses = ["grn", "grn"];
    const once = deriveDispatchStatus(statuses, DISPATCHED);
    expect(deriveDispatchStatus(statuses, DISPATCHED)).toBe(once);
  });

  it("ignores an unrecognised invoice status rather than over-advancing", () => {
    expect(deriveDispatchStatus(["grn", "something-new"], DISPATCHED)).toBe("dispatched");
  });
});

describe("canMarkDispatched", () => {
  it("is offered only from draft", () => {
    expect(canMarkDispatched("draft")).toBe(true);
    for (const status of ["dispatched", "received", "catalogued", null, undefined]) {
      expect(canMarkDispatched(status)).toBe(false);
    }
  });
});

describe("canRecordDispatchGrn", () => {
  it("is offered only once the dispatch has been marked dispatched", () => {
    expect(canRecordDispatchGrn("dispatched")).toBe(true);
    for (const status of ["draft", "received", "catalogued", null, undefined]) {
      expect(canRecordDispatchGrn(status)).toBe(false);
    }
  });
});
