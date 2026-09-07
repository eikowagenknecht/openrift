import { describe, expect, it } from "vitest";

import type { MetaDeckContextRow } from "../repositories/meta.js";
import { metaDeckImageFraming } from "./meta-share-image.js";

function context(overrides: Partial<MetaDeckContextRow> = {}): MetaDeckContextRow {
  return {
    playerId: "p1",
    listStatus: "full",
    playerName: "adtoll",
    sourceIdentity: null,
    rank: 1,
    rankIsTier: false,
    wins: null,
    losses: null,
    draws: null,
    eventSlug: "summoner-skirmish-wuhan-2026",
    eventName: "Summoner Skirmish Wuhan",
    eventDate: "2026-03-14",
    eventFormat: "constructed",
    eventTier: "premier",
    eventCountry: "CN",
    eventPlayerCount: 3283,
    ...overrides,
  };
}

describe("metaDeckImageFraming", () => {
  it("titles the image with the legend and bylines the player", () => {
    const framing = metaDeckImageFraming(context(), "Irelia, Blade Dancer");

    expect(framing.deckName).toBe("Irelia, Blade Dancer");
    expect(framing.ownerName).toBe("adtoll");
  });

  it("states the finish against the field and names the event", () => {
    expect(metaDeckImageFraming(context(), "Irelia, Blade Dancer").resultLine).toBe(
      "1st of 3,283 · Summoner Skirmish Wuhan",
    );
  });

  it("includes the record when the source published one", () => {
    const framing = metaDeckImageFraming(
      context({ wins: 14, losses: 1, draws: 0 }),
      "Irelia, Blade Dancer",
    );

    expect(framing.resultLine).toBe("1st of 3,283 · 14-1-0 · Summoner Skirmish Wuhan");
  });

  it("prints a missing draw count as zero", () => {
    expect(metaDeckImageFraming(context({ wins: 5, losses: 2 }), "Legend").resultLine).toContain(
      "5-2-0",
    );
  });

  it("leaves the record out when the source published wins only", () => {
    expect(metaDeckImageFraming(context({ wins: 5 }), "Legend").resultLine).toBe(
      "1st of 3,283 · Summoner Skirmish Wuhan",
    );
  });

  it("leaves the field size unsaid when the source reported none", () => {
    expect(metaDeckImageFraming(context({ eventPlayerCount: null }), "Legend").resultLine).toBe(
      "1st · Summoner Skirmish Wuhan",
    );
  });

  it("leaves the field size unsaid when the source reported zero players", () => {
    expect(metaDeckImageFraming(context({ eventPlayerCount: 0 }), "Legend").resultLine).toBe(
      "1st · Summoner Skirmish Wuhan",
    );
  });

  it("prints a bucketed finish above the podium as a tier", () => {
    expect(
      metaDeckImageFraming(context({ rank: 8, rankIsTier: true }), "Legend").resultLine,
    ).toContain("T8 of 3,283");
  });

  it("keeps the podium exact for a bucketed source", () => {
    expect(
      metaDeckImageFraming(context({ rank: 2, rankIsTier: true }), "Legend").resultLine,
    ).toContain("2nd of 3,283");
  });

  it("titles a list with no legend with the player, dropping the byline", () => {
    const framing = metaDeckImageFraming(context(), null);

    expect(framing.deckName).toBe("adtoll");
    expect(framing.ownerName).toBeUndefined();
  });

  it("falls back to the event name when the list has neither legend nor player", () => {
    const framing = metaDeckImageFraming(context({ playerName: "" }), null);

    expect(framing.deckName).toBe("Summoner Skirmish Wuhan");
    expect(framing.ownerName).toBeUndefined();
  });

  it("drops the byline for a legend whose player the source left unnamed", () => {
    const framing = metaDeckImageFraming(context({ playerName: "" }), "Irelia, Blade Dancer");

    expect(framing.deckName).toBe("Irelia, Blade Dancer");
    expect(framing.ownerName).toBeUndefined();
  });
});
