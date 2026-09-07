import type { LandingSummaryResponse } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { landingThumbnailCards } from "./landing-thumbnails";

type Thumbnail = LandingSummaryResponse["thumbnails"][number];

function thumbnail(overrides: Partial<Thumbnail> = {}): Thumbnail {
  return {
    imageId: "019d02f1-d14f-769f-9295-9852db692dbe",
    rarity: "epic",
    domains: ["fury"],
    name: "Jinx, Rebel",
    shortCode: "OGN-202",
    variantLabel: null,
    priceCents: 420,
    ...overrides,
  };
}

describe("landingThumbnailCards", () => {
  it("returns an empty list when the payload has not loaded", () => {
    expect(landingThumbnailCards(undefined)).toEqual([]);
    expect(landingThumbnailCards([])).toEqual([]);
  });

  it("carries the card identity next to its art", () => {
    const [card] = landingThumbnailCards([
      thumbnail({ variantLabel: "Foil", shortCode: "OGN-213" }),
    ]);
    expect(card!.name).toBe("Jinx, Rebel");
    expect(card!.shortCode).toBe("OGN-213");
    expect(card!.variantLabel).toBe("Foil");
    expect(card!.url).toContain("019d02f1-d14f-769f-9295-9852db692dbe");
  });

  it("carries the rarity and domains the vignette rows lead with", () => {
    const [card] = landingThumbnailCards([
      thumbnail({ rarity: "epic", domains: ["fury", "calm"] }),
    ]);
    expect(card!.rarity).toBe("epic");
    expect(card!.domains).toEqual(["fury", "calm"]);
  });

  it("converts the price from cents to euros", () => {
    expect(landingThumbnailCards([thumbnail({ priceCents: 420 })])[0]!.price).toBe(4.2);
  });

  it("keeps a printing without a price", () => {
    expect(landingThumbnailCards([thumbnail({ priceCents: null })])[0]!.price).toBeNull();
  });

  it("keeps payload order so the pages' index slices stay aligned", () => {
    const cards = landingThumbnailCards([
      thumbnail({ shortCode: "OGN-001" }),
      thumbnail({ shortCode: "OGN-002" }),
      thumbnail({ shortCode: "OGN-003" }),
    ]);
    expect(cards.map((c) => c.shortCode)).toEqual(["OGN-001", "OGN-002", "OGN-003"]);
  });

  it("survives an edge-cached payload from before the identity fields", () => {
    const legacy = { imageId: "img-1" } as unknown as Thumbnail;
    expect(landingThumbnailCards([legacy])[0]).toMatchObject({
      name: "",
      shortCode: "",
      variantLabel: null,
      rarity: "",
      domains: [],
      price: null,
    });
  });
});
