import { describe, expect, it } from "vitest";

import {
  cardResolutionKey,
  eventStatusForTournamentStatus,
  legendComboResolutions,
} from "./deck-check.js";

describe("eventStatusForTournamentStatus", () => {
  it("treats setup and running as active (submissions are handed in before start)", () => {
    // Regression: a wizard-created deck-check tournament sits in `setup` until
    // round 1 is generated, which never happens when OpenRift is used only for
    // deck check. That must not archive the event or the provider push 409s.
    expect(eventStatusForTournamentStatus("setup")).toBe("active");
    expect(eventStatusForTournamentStatus("running")).toBe("active");
  });

  it("archives only a completed or cancelled tournament", () => {
    expect(eventStatusForTournamentStatus("completed")).toBe("archived");
    expect(eventStatusForTournamentStatus("cancelled")).toBe("archived");
  });
});

describe("legendComboResolutions", () => {
  const azir = { id: "card-azir", normName: "emperorofthesands", tags: ["Azir"] };
  const kindred = { id: "card-kindred", normName: "twinsouls", tags: ["Kindred", "Lamb"] };

  it("resolves the colloquial 'Champion, Title' form", () => {
    const wanted = new Set([cardResolutionKey("Azir, Emperor of the Sands")]);
    expect(legendComboResolutions([azir], wanted)).toEqual([
      { norm: "aziremperorofthesands", cardId: "card-azir" },
    ]);
  });

  it("does not emit a combo whose norm is not requested", () => {
    const wanted = new Set([cardResolutionKey("Emperor of the Sands")]);
    expect(legendComboResolutions([azir], wanted)).toEqual([]);
  });

  it("matches any of a Legend's tags", () => {
    const wanted = new Set([
      cardResolutionKey("Kindred, Twin Souls"),
      cardResolutionKey("Lamb, Twin Souls"),
    ]);
    expect(legendComboResolutions([kindred], wanted)).toEqual([
      { norm: "kindredtwinsouls", cardId: "card-kindred" },
      { norm: "lambtwinsouls", cardId: "card-kindred" },
    ]);
  });

  it("returns nothing for an empty wanted set", () => {
    expect(legendComboResolutions([azir, kindred], new Set())).toEqual([]);
  });

  it("returns nothing for a Legend with no tags", () => {
    const nameless = { id: "card-x", normName: "namelesslegend", tags: [] };
    const wanted = new Set([cardResolutionKey("Nameless Legend")]);
    expect(legendComboResolutions([nameless], wanted)).toEqual([]);
  });
});
