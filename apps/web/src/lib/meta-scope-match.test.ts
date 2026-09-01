import { describe, expect, it } from "vitest";

import type { MetaEra } from "@/lib/meta-scope";
import type { ScopedEvent } from "@/lib/meta-scope-match";
import { scopeMatches } from "@/lib/meta-scope-match";

const ERAS: MetaEra[] = [
  { id: "origins", label: "Origins", from: "2026-01-01", to: "2026-07-31" },
  { id: "vendetta", label: "Vendetta", from: "2026-08-01", to: null },
];

function event(overrides: Partial<ScopedEvent> = {}): ScopedEvent {
  return {
    eventDate: "2026-08-20",
    format: "constructed",
    tier: "premier",
    country: "FR",
    ...overrides,
  };
}

describe("scopeMatches", () => {
  it("matches everything when the scope narrows nothing", () => {
    expect(scopeMatches(event(), {}, ERAS)).toBe(true);
  });

  it("matches an era by its date window, either end inclusive", () => {
    expect(scopeMatches(event({ eventDate: "2026-08-01" }), { era: "vendetta" }, ERAS)).toBe(true);
    expect(scopeMatches(event({ eventDate: "2026-07-31" }), { era: "vendetta" }, ERAS)).toBe(false);
    expect(scopeMatches(event({ eventDate: "2026-07-31" }), { era: "origins" }, ERAS)).toBe(true);
  });

  it("leaves the current era open-ended", () => {
    expect(scopeMatches(event({ eventDate: "2031-01-01" }), { era: "vendetta" }, ERAS)).toBe(true);
  });

  it("reads a custom range's bounds, and an open bound as unbounded", () => {
    const scope = { era: "custom", from: "2026-08-01", to: "2026-08-19" };
    expect(scopeMatches(event({ eventDate: "2026-08-20" }), scope, ERAS)).toBe(false);
    expect(scopeMatches(event({ eventDate: "2026-08-19" }), scope, ERAS)).toBe(true);
    expect(
      scopeMatches(event({ eventDate: "2026-08-20" }), { era: "custom", from: "2026-08-01" }, ERAS),
    ).toBe(true);
  });

  it("treats all-time and an era the set list no longer knows as no narrowing", () => {
    expect(scopeMatches(event({ eventDate: "2020-01-01" }), { era: "all" }, ERAS)).toBe(true);
    expect(scopeMatches(event({ eventDate: "2020-01-01" }), { era: "retired-set" }, ERAS)).toBe(
      true,
    );
  });

  it("matches format and tier exactly", () => {
    expect(scopeMatches(event(), { formats: ["constructed"] }, ERAS)).toBe(true);
    expect(scopeMatches(event(), { formats: ["limited"] }, ERAS)).toBe(false);
    expect(scopeMatches(event(), { tiers: ["premier"] }, ERAS)).toBe(true);
    expect(scopeMatches(event(), { tiers: ["store"] }, ERAS)).toBe(false);
  });

  it("keeps an event matching any one of a facet's picks", () => {
    expect(scopeMatches(event(), { tiers: ["store", "premier"] }, ERAS)).toBe(true);
    expect(scopeMatches(event(), { tiers: ["store", "casual"] }, ERAS)).toBe(false);
  });

  it("keeps everything but the excluded values", () => {
    expect(scopeMatches(event(), { tiersEx: ["store"] }, ERAS)).toBe(true);
    expect(scopeMatches(event(), { tiersEx: ["premier"] }, ERAS)).toBe(false);
    expect(scopeMatches(event({ country: "DE" }), { countriesEx: ["FR"] }, ERAS)).toBe(true);
    expect(scopeMatches(event({ country: "FR" }), { countriesEx: ["fr"] }, ERAS)).toBe(false);
  });

  it("keeps an event with no recorded venue out of an include and inside an exclude", () => {
    expect(scopeMatches(event({ country: null }), { countries: ["FR"] }, ERAS)).toBe(false);
    expect(scopeMatches(event({ country: null }), { countriesEx: ["FR"] }, ERAS)).toBe(true);
    expect(scopeMatches(event({ country: null }), {}, ERAS)).toBe(true);
  });

  it("ignores an empty facet, so a cleared control narrows nothing", () => {
    expect(scopeMatches(event(), { tiers: [], countriesEx: [] }, ERAS)).toBe(true);
  });

  it("matches a country whichever case either side arrives in", () => {
    expect(scopeMatches(event({ country: "fr" }), { countries: ["FR"] }, ERAS)).toBe(true);
    expect(scopeMatches(event({ country: "FR" }), { countries: ["fr"] }, ERAS)).toBe(true);
    expect(scopeMatches(event({ country: "DE" }), { countries: ["fr"] }, ERAS)).toBe(false);
  });

  it("ignores a country the code list cannot resolve, rather than emptying the page", () => {
    expect(scopeMatches(event(), { countries: ["??"] }, ERAS)).toBe(true);
  });

  it("requires every populated facet at once", () => {
    const scope = {
      era: "vendetta",
      tiers: ["premier"],
      countries: ["FR"],
      formats: ["constructed"],
    };
    expect(scopeMatches(event(), scope, ERAS)).toBe(true);
    expect(scopeMatches(event({ tier: "store" }), scope, ERAS)).toBe(false);
  });
});
