import { describe, expect, it } from "vitest";

import {
  classifyMetaEventTier,
  countryFromAddress,
  suggestTierForTemplateName,
} from "./meta-event-classify.js";

/** The stored default of `meta_sync_settings.competitive_player_floor`. */
const FLOOR = 128;

describe("classifyMetaEventTier", () => {
  it("keeps a mapped template tier a small field cannot reach", () => {
    expect(classifyMetaEventTier({ templateTier: "premier", playerCount: 8 }, FLOOR)).toBe(
      "premier",
    );
    expect(classifyMetaEventTier({ templateTier: "competitive", playerCount: 59 }, FLOOR)).toBe(
      "competitive",
    );
  });

  it("raises a local template a large field ran under", () => {
    expect(classifyMetaEventTier({ templateTier: "local", playerCount: 710 }, FLOOR)).toBe(
      "competitive",
    );
  });

  it("never lets a small field lower a premier template", () => {
    expect(classifyMetaEventTier({ templateTier: "premier", playerCount: 4 }, FLOOR)).toBe(
      "premier",
    );
  });

  it("never reaches premier on field size alone", () => {
    expect(classifyMetaEventTier({ templateTier: null, playerCount: 2224 }, FLOOR)).toBe(
      "competitive",
    );
  });

  it("takes competitive from an unmapped template at the floor", () => {
    expect(classifyMetaEventTier({ templateTier: null, playerCount: FLOOR }, FLOOR)).toBe(
      "competitive",
    );
  });

  it("reads the floor from the caller", () => {
    expect(classifyMetaEventTier({ templateTier: null, playerCount: 32 }, 32)).toBe("competitive");
    expect(classifyMetaEventTier({ templateTier: null, playerCount: 32 }, 512)).toBe("local");
  });

  it("falls back to local for a small or unknown field", () => {
    expect(classifyMetaEventTier({ templateTier: null, playerCount: 64 }, FLOOR)).toBe("local");
    expect(classifyMetaEventTier({ playerCount: null }, FLOOR)).toBe("local");
    expect(classifyMetaEventTier({}, FLOOR)).toBe("local");
  });
});

describe("suggestTierForTemplateName", () => {
  it("suggests premier for the Regional Qualifier template", () => {
    expect(suggestTierForTemplateName("Riftbound Regional Qualifier")).toBe("premier");
  });

  it("suggests competitive for the RQ side-event templates despite their needle words", () => {
    expect(suggestTierForTemplateName("Pre-RQ Challenge")).toBe("competitive");
    expect(suggestTierForTemplateName("Regional Rebound")).toBe("competitive");
    expect(suggestTierForTemplateName("Super Nexus Night")).toBe("competitive");
  });

  it("suggests local for skirmish templates and play nights alike", () => {
    expect(suggestTierForTemplateName("Vendetta Summoner Skirmish I")).toBe("local");
    expect(suggestTierForTemplateName("Nexus Nights - 1v1")).toBe("local");
    expect(suggestTierForTemplateName("Riftbound Open Play")).toBe("local");
    expect(suggestTierForTemplateName("Learn-to-Play Event")).toBe("local");
  });

  it("suggests local for a league night without claiming the game's own name", () => {
    expect(suggestTierForTemplateName("Friday League Night")).toBe("local");
    expect(suggestTierForTemplateName("Riftbound: League of Legends TCG Sealed")).toBeNull();
  });

  it("suggests nothing for a name the rules do not recognize, or no name at all", () => {
    expect(suggestTierForTemplateName("Full Box Sealed")).toBeNull();
    expect(suggestTierForTemplateName(null)).toBeNull();
  });
});

describe("countryFromAddress", () => {
  it("reads a structured trailing ISO code", () => {
    expect(countryFromAddress("General Luna Street, Dipolog City, IX, 7100, PH")).toBe("PH");
    expect(countryFromAddress("199b, Jln PSK 5, Alor Setar, Kedah, 05400, MY")).toBe("MY");
  });

  it("rejects a bare state or province tail that collides with a country code", () => {
    expect(countryFromAddress("123 Main St, Springfield, IL")).toBeNull();
    expect(countryFromAddress("1500 J Street, Sacramento, CA")).toBeNull();
    expect(countryFromAddress("801 16th Street, Denver, CO")).toBeNull();
    expect(countryFromAddress("1500 J Street, Sacramento, CA 95814")).toBeNull();
  });

  it("rejects a two-letter tail that is not an assigned country code", () => {
    expect(countryFromAddress("123 Main St, Springfield, 62704, ZZ")).toBeNull();
  });

  it("reads a trailing country name in the store's own language", () => {
    expect(countryFromAddress("Bahnhofstraße 4, 23795 Bad Segeberg, Germany")).toBe("DE");
    expect(countryFromAddress("Hauptplatz 1, 8010 Graz, Österreich")).toBe("AT");
    expect(countryFromAddress("Rua Alegre 10, São Paulo, Brasil")).toBe("BR");
    expect(countryFromAddress("Via Roma 1, 16121 Genova, Italia")).toBe("IT");
  });

  it("strips trailing postal digits before matching the name", () => {
    expect(countryFromAddress("865 Mountbatten Rd, Singapore 437844")).toBe("SG");
    expect(countryFromAddress("33F Triton Drive, Rosedale, Auckland 0632, New Zealand")).toBe("NZ");
  });

  it("requires a word boundary before the matched name", () => {
    expect(countryFromAddress("Via Giardini 5, Ragusa")).toBeNull();
  });

  it("returns null for a null or unparseable address", () => {
    expect(countryFromAddress(null)).toBeNull();
    expect(countryFromAddress("Somewhere on Runeterra")).toBeNull();
    expect(countryFromAddress("")).toBeNull();
  });
});
