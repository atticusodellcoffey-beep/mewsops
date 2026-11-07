import { describe, expect, it } from "vitest";
import { timestamp, DomainError } from "../../src/domain/types.js";

describe("UTC evidence timestamps", () => {
  it("normalizes valid fractional precision and rejects rollover dates", () => {
    expect(timestamp("2026-11-07T12:00:00Z")).toBe("2026-11-07T12:00:00.000Z");
    expect(timestamp("2026-11-07T12:00:00.1Z")).toBe(
      "2026-11-07T12:00:00.100Z",
    );
    for (const invalid of [
      "2026-02-30T12:00:00Z",
      "2026-11-07T24:00:00Z",
      "2026-11-07",
      "2026-11-07T12:00:00-05:00",
    ]) {
      expect(() => timestamp(invalid)).toThrow(DomainError);
    }
  });
});
