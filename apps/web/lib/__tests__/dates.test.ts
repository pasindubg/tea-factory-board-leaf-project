import { describe, it, expect } from "vitest";
import { dayRange, localDateString, lastNDates } from "../dates";

describe("dayRange", () => {
  it("returns a 24-hour window", () => {
    const { start, end } = dayRange("2024-01-15");
    const diff = new Date(end).getTime() - new Date(start).getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it("returns valid ISO strings", () => {
    const { start, end } = dayRange("2024-03-20");
    expect(new Date(start).toISOString()).toBe(start);
    expect(new Date(end).toISOString()).toBe(end);
  });

  it("start aligns with midnight of the given date", () => {
    const { start } = dayRange("2024-07-04");
    const fromMidnight = new Date("2024-07-04T00:00:00").toISOString();
    expect(start).toBe(fromMidnight);
  });
});

describe("localDateString", () => {
  it("returns YYYY-MM-DD format", () => {
    const result = localDateString(new Date("2024-03-05T10:00:00"));
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("pads single-digit month and day with zeros", () => {
    const result = localDateString(new Date("2024-01-05T00:00:00"));
    expect(result).toBe("2024-01-05");
  });

  it("handles end-of-month dates", () => {
    const result = localDateString(new Date("2024-12-31T12:00:00"));
    expect(result).toBe("2024-12-31");
  });

  it("defaults to today when no argument given", () => {
    const result = localDateString();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("lastNDates", () => {
  it("returns exactly n dates", () => {
    expect(lastNDates(7)).toHaveLength(7);
    expect(lastNDates(1)).toHaveLength(1);
    expect(lastNDates(30)).toHaveLength(30);
  });

  it("last date is today", () => {
    const dates = lastNDates(5);
    expect(dates[dates.length - 1]).toBe(localDateString());
  });

  it("consecutive dates are exactly 1 day apart", () => {
    const dates = lastNDates(5);
    for (let i = 1; i < dates.length; i++) {
      const diff =
        new Date(dates[i]).getTime() - new Date(dates[i - 1]).getTime();
      expect(diff).toBe(24 * 60 * 60 * 1000);
    }
  });

  it("all entries match YYYY-MM-DD format", () => {
    lastNDates(7).forEach((d) => expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/));
  });
});
