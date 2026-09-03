import { describe, expect, it } from "vitest";

import {
  defaultMetaDeckName,
  metaEventSlugBase,
  metaEventSlugCandidates,
  resolvedStandingName,
} from "./meta-event-naming.js";

/** The CHECK constraint on `meta_events.slug`, so every case can assert against it. */
const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,49}$/u;

describe("metaEventSlugBase", () => {
  it("slugifies the name and appends the event's year", () => {
    expect(metaEventSlugBase("Summoner Skirmish Berlin", "2026-08-01")).toBe(
      "summoner-skirmish-berlin-2026",
    );
  });

  it("keeps a year the name already ends with", () => {
    expect(metaEventSlugBase("Rift Open 2026", "2026-08-01")).toBe("rift-open-2026");
  });

  it("still appends when the name carries a different year", () => {
    expect(metaEventSlugBase("Rift Open 2025", "2026-08-01")).toBe("rift-open-2025-2026");
  });

  it("collapses punctuation and casing", () => {
    expect(metaEventSlugBase("Noxus  Invitational -- Round #2!", "2026-01-05")).toBe(
      "noxus-invitational-round-2-2026",
    );
  });

  it("falls back when the name slugifies to nothing", () => {
    expect(metaEventSlugBase("???", "2026-08-01")).toBe("event-2026");
    expect(metaEventSlugBase("東京", "2026-08-01")).toBe("event-2026");
  });

  it("truncates a long name to fit the column, hyphens trimmed", () => {
    const slug = metaEventSlugBase(`${"a".repeat(80)} open`, "2026-08-01");
    expect(slug.length).toBeLessThanOrEqual(50);
    expect(slug.endsWith("-2026")).toBe(true);
    expect(slug).toMatch(SLUG_PATTERN);
  });

  it("produces a valid slug when the date carries no year", () => {
    expect(metaEventSlugBase("Rift Open", "not-a-date")).toBe("rift-open");
  });

  it("pads a name too short to satisfy the minimum length", () => {
    expect(metaEventSlugBase("AB", "not-a-date")).toBe("event");
  });

  it("always produces a slug the column accepts", () => {
    const names = ["Summoner Skirmish", "2026", "-- x --", "Ω", "a", `${"z".repeat(200)}`];
    for (const name of names) {
      expect(metaEventSlugBase(name, "2026-08-01")).toMatch(SLUG_PATTERN);
    }
  });
});

describe("metaEventSlugCandidates", () => {
  it("offers the base first, then numbered variants", () => {
    const slugs = metaEventSlugCandidates("Rift Open", "2026-08-01");
    expect(slugs.slice(0, 3)).toEqual(["rift-open-2026", "rift-open-2026-2", "rift-open-2026-3"]);
  });

  it("drops a reserved slug rather than rewriting it", () => {
    const slugs = metaEventSlugCandidates("Decks", "no-year-here");
    expect(slugs).not.toContain("decks");
    expect(slugs[0]).toBe("decks-2");
  });

  it("reserves every name a static /meta child owns", () => {
    for (const name of ["Legends", "Submit", "Submissions"]) {
      const slugs = metaEventSlugCandidates(name, "no-year-here");
      expect(slugs).not.toContain(name.toLowerCase());
    }
  });

  it("keeps every variant inside the column's grammar", () => {
    for (const slug of metaEventSlugCandidates(`${"a".repeat(80)} open`, "2026-08-01")) {
      expect(slug).toMatch(SLUG_PATTERN);
    }
  });

  it("returns distinct slugs", () => {
    const slugs = metaEventSlugCandidates("Rift Open", "2026-08-01");
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});

describe("resolvedStandingName", () => {
  it("takes the row's own name when the source published one", () => {
    expect(resolvedStandingName({ playerName: "Renata", uvsgamesPlayerId: null }, new Map())).toBe(
      "Renata",
    );
  });

  it("resolves a row keyed by user id through the source's display names", () => {
    expect(
      resolvedStandingName(
        { playerName: null, uvsgamesPlayerId: 42 },
        new Map([[42, "Master Yi Enjoyer"]]),
      ),
    ).toBe("Master Yi Enjoyer");
  });

  it("resolves to nothing when the id has no display name on file", () => {
    expect(resolvedStandingName({ playerName: null, uvsgamesPlayerId: 42 }, new Map())).toBe("");
  });

  it("resolves to nothing when neither a name nor an id is given", () => {
    expect(resolvedStandingName({ playerName: null, uvsgamesPlayerId: null }, new Map())).toBe("");
  });
});

describe("defaultMetaDeckName", () => {
  it("leads with the legend and names the player", () => {
    expect(defaultMetaDeckName("Azir, Emperor of the Sands", "Renata", "Rift Open")).toBe(
      "Azir, Emperor of the Sands (Renata)",
    );
  });

  it("falls back to the event name when the deck has no legend", () => {
    expect(defaultMetaDeckName(null, "Renata", "Rift Open")).toBe("Rift Open (Renata)");
  });

  it("treats an empty legend name as no legend", () => {
    expect(defaultMetaDeckName("", "Renata", "Rift Open")).toBe("Rift Open (Renata)");
  });

  it("drops the brackets rather than printing an empty pair for a nameless player", () => {
    expect(defaultMetaDeckName("Irelia, Blade Dancer", "", "Rift Open")).toBe(
      "Irelia, Blade Dancer",
    );
  });

  it("names the player alone when neither a legend nor an event is given", () => {
    expect(defaultMetaDeckName(null, "Renata", "")).toBe("(Renata)");
  });

  it("falls back to a placeholder when it is given nothing at all", () => {
    expect(defaultMetaDeckName(null, "", "")).toBe("Untitled deck");
  });

  it("truncates to the deck name column's bound", () => {
    const name = defaultMetaDeckName("L".repeat(300), "Renata", "Rift Open");
    expect(name.length).toBe(200);
  });
});
