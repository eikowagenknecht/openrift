import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { defaultVariantName } from "@/components/deck/deck-variant-create-dialog";

describe("defaultVariantName", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-14T22:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("suffixes a variant with its kind", () => {
    expect(defaultVariantName("Yasuo Aggro", "variant")).toBe("Yasuo Aggro (variant)");
  });

  it("dates a checkpoint so several of them stay tellable apart", () => {
    expect(defaultVariantName("Yasuo Aggro", "checkpoint")).toBe("Yasuo Aggro (2026-08-14)");
  });

  it("keeps the date in UTC rather than the viewer's day", () => {
    vi.setSystemTime(new Date("2026-08-14T23:59:59Z"));
    expect(defaultVariantName("Summoner Skirmish list", "checkpoint")).toBe(
      "Summoner Skirmish list (2026-08-14)",
    );
  });

  it("leaves an empty name empty apart from the suffix", () => {
    expect(defaultVariantName("", "variant")).toBe(" (variant)");
  });
});
