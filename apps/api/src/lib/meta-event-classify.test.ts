import { describe, expect, it } from "vitest";

import {
  classifyMetaEventTier,
  countryFromAddress,
  suggestTierForTemplateName,
} from "./meta-event-classify.js";

describe("classifyMetaEventTier", () => {
  it("takes the admin-mapped template tier as authoritative", () => {
    expect(classifyMetaEventTier({ templateTier: "premier", playerCount: 8 })).toBe("premier");
    expect(classifyMetaEventTier({ templateTier: "casual", playerCount: 2224 })).toBe("casual");
  });

  it("falls back to competitive for an unmapped template with a large field", () => {
    expect(classifyMetaEventTier({ templateTier: null, playerCount: 128 })).toBe("competitive");
  });

  it("falls back to store for a small or unknown field", () => {
    expect(classifyMetaEventTier({ templateTier: null, playerCount: 64 })).toBe("store");
    expect(classifyMetaEventTier({ playerCount: null })).toBe("store");
    expect(classifyMetaEventTier({})).toBe("store");
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

  it("suggests store for skirmish templates and casual for play nights", () => {
    expect(suggestTierForTemplateName("Vendetta Summoner Skirmish I")).toBe("store");
    expect(suggestTierForTemplateName("Nexus Nights - 1v1")).toBe("casual");
    expect(suggestTierForTemplateName("Riftbound Open Play")).toBe("casual");
    expect(suggestTierForTemplateName("Learn-to-Play Event")).toBe("casual");
  });

  it("suggests casual for a league night without claiming the game's own name", () => {
    expect(suggestTierForTemplateName("Friday League Night")).toBe("casual");
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
