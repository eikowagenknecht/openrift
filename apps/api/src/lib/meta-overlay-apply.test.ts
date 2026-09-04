import { describe, expect, it } from "vitest";

import { applyOverlays, claimedFieldSet } from "./meta-overlay-apply.js";

interface EventValues extends Record<string, unknown> {
  name: string;
  organizer: string | null;
  tier: string;
}

const BASE: EventValues = { name: "Summoner Skirmish", organizer: "LGS Berlin", tier: "local" };

describe("applyOverlays", () => {
  it("returns the base untouched when nothing is claimed", () => {
    expect(applyOverlays(BASE, [])).toEqual(BASE);
  });

  it("takes a claimed field and leaves the rest to the base", () => {
    const result = applyOverlays<"tier" | "name", EventValues>(BASE, [
      { claimedFields: ["tier"], values: { tier: "premier" } },
    ]);

    expect(result).toEqual({ ...BASE, tier: "premier" });
  });

  it("clears a field an overlay claims as null", () => {
    const result = applyOverlays<"organizer", EventValues>(BASE, [
      { claimedFields: ["organizer"], values: { organizer: null } },
    ]);

    expect(result.organizer).toBeNull();
  });

  it("ignores a value the overlay carries but does not claim", () => {
    const result = applyOverlays<"tier", EventValues>(BASE, [
      { claimedFields: ["tier"], values: { tier: "premier", name: "Ignored" } },
    ]);

    expect(result.name).toBe("Summoner Skirmish");
  });

  it("ignores a claimed field the overlay carries no value for", () => {
    const result = applyOverlays<"name", EventValues>(BASE, [
      { claimedFields: ["name"], values: {} },
    ]);

    expect(result.name).toBe("Summoner Skirmish");
  });

  it("lets the later overlay win a field both claim", () => {
    const result = applyOverlays<"tier", EventValues>(BASE, [
      { claimedFields: ["tier"], values: { tier: "competitive" } },
      { claimedFields: ["tier"], values: { tier: "premier" } },
    ]);

    expect(result.tier).toBe("premier");
  });

  it("does not mutate the base", () => {
    applyOverlays<"tier", EventValues>(BASE, [
      { claimedFields: ["tier"], values: { tier: "premier" } },
    ]);

    expect(BASE.tier).toBe("local");
  });
});

describe("claimedFieldSet", () => {
  it("is empty without overlays", () => {
    expect(claimedFieldSet([])).toEqual(new Set());
  });

  it("unions the claims across overlays", () => {
    const claimed = claimedFieldSet<"tier" | "organizer">([
      { claimedFields: ["tier"], values: undefined },
      { claimedFields: ["organizer", "tier"], values: undefined },
    ]);

    expect(claimed).toEqual(new Set(["tier", "organizer"]));
  });
});
