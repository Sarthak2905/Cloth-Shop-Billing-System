import { describe, expect, test } from "vitest";
import { shopRanges, tzString } from "./ownerDashboard.js";

describe("shop day boundaries (India, UTC+5:30)", () => {
  test("a sale at 11:30 pm India time still belongs to that day", () => {
    // 2026-11-25 18:00 UTC = 2026-11-25 23:30 India
    const r = shopRanges(new Date("2026-11-25T18:00:00Z"), 330);
    expect(r.todayStart.toISOString()).toBe("2026-11-24T18:30:00.000Z");
    expect(r.tomorrowStart.toISOString()).toBe("2026-11-25T18:30:00.000Z");
  });

  test("12:10 am India time is already the next day", () => {
    // 2026-11-25 18:40 UTC = 2026-11-26 00:10 India
    const r = shopRanges(new Date("2026-11-25T18:40:00Z"), 330);
    expect(r.todayStart.toISOString()).toBe("2026-11-25T18:30:00.000Z");
  });

  test("month start and last month start", () => {
    const r = shopRanges(new Date("2026-01-10T06:00:00Z"), 330);
    expect(r.monthStart.toISOString()).toBe("2025-12-31T18:30:00.000Z");
    expect(r.lastMonthStart.toISOString()).toBe("2025-11-30T18:30:00.000Z");
  });

  test("the last seven days start six days before today", () => {
    const r = shopRanges(new Date("2026-11-25T06:00:00Z"), 330);
    expect(r.weekStart.toISOString()).toBe("2026-11-18T18:30:00.000Z");
  });
});

test("the time zone text for MongoDB", () => {
  expect(tzString(330)).toBe("+05:30");
  expect(tzString(-300)).toBe("-05:00");
  expect(tzString(0)).toBe("+00:00");
});
