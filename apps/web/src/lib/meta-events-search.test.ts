import { describe, expect, it } from "vitest";

import { metaEventsSearchSchema } from "./meta-events-search";

describe("metaEventsSearchSchema", () => {
  it("keeps the scope fields alongside its own", () => {
    expect(
      metaEventsSearchSchema.parse({
        q: "vienna",
        by: "players",
        dir: "asc",
        tiers: ["premier"],
      }),
    ).toMatchObject({ q: "vienna", by: "players", dir: "asc", tiers: ["premier"] });
  });

  it("keeps a holdings filter, and drops one the page does not offer", () => {
    expect(metaEventsSearchSchema.parse({ holds: "decks" }).holds).toBe("decks");
    expect(metaEventsSearchSchema.parse({ holds: "photos" }).holds).toBeUndefined();
  });

  it("drops a sort a stale bookmark names but the page no longer has", () => {
    const parsed = metaEventsSearchSchema.parse({ by: "organizer", dir: "sideways" });
    expect(parsed.by).toBeUndefined();
    expect(parsed.dir).toBeUndefined();
  });

  it("keeps the scope fields a bad sort travelled with", () => {
    expect(metaEventsSearchSchema.parse({ by: "organizer", countries: ["AT"] })).toMatchObject({
      countries: ["AT"],
    });
  });

  it("parses an empty URL", () => {
    expect(metaEventsSearchSchema.parse({})).toEqual({});
  });
});
