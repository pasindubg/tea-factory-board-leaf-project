import { describe, expect, it } from "vitest";
import { getDetailStateModel, type DetailStateStep } from "./detail-workspace-state";

const steps: DetailStateStep[] = [
  { key: "draft", label: "Draft", metric: "2 records" },
  { key: "confirmed", label: "Confirmed", metric: "2/2 records" },
  { key: "complete", label: "Complete", metric: "Ready" },
];

describe("getDetailStateModel", () => {
  it("resolves the current lifecycle step and progress", () => {
    const model = getDetailStateModel(steps, "confirmed");
    expect(model).toMatchObject({
      current: steps[1],
      currentIndex: 1,
    });
    expect(model.progress).toBeCloseTo(200 / 3);
  });

  it("falls back to the first declared step for an unknown state", () => {
    const model = getDetailStateModel(steps, "legacy");
    expect(model).toMatchObject({
      current: steps[0],
      currentIndex: 0,
    });
    expect(model.progress).toBeCloseTo(100 / 3);
  });

  it("handles an empty lifecycle without dividing by zero", () => {
    expect(getDetailStateModel([], "draft")).toEqual({
      steps: [],
      current: null,
      currentIndex: -1,
      progress: 0,
    });
  });
});
