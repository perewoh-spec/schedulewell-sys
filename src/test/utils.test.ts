import { afterEach, describe, expect, it, vi } from "vitest";
import { errorMessage, formatDate, todayLocal } from "@/lib/utils";

describe("todayLocal", () => {
  afterEach(() => vi.useRealTimers());

  it("returns the local calendar date, not the UTC one", () => {
    vi.useFakeTimers();
    // 00:30 local time on 7 March: toISOString() would still say 6 March east of UTC.
    vi.setSystemTime(new Date(2026, 2, 7, 0, 30));
    expect(todayLocal()).toBe("2026-03-07");
  });

  it("pads month and day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12));
    expect(todayLocal()).toBe("2026-01-05");
  });
});

describe("formatDate", () => {
  it("keeps the same calendar day", () => {
    expect(formatDate("2026-12-01")).toBe(new Date(2026, 11, 1).toLocaleDateString());
  });

  it("shows a dash for empty values", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });
});

describe("errorMessage", () => {
  it("reads Error and Supabase-style errors", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
    expect(errorMessage({ message: "duplicate key" })).toBe("duplicate key");
    expect(errorMessage(undefined)).toBe("Something went wrong");
  });
});
