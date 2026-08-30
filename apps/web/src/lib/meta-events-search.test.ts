import { describe, expect, it } from "vitest";

import { metaEventsSearchSchema } from "./meta-events-search";

describe("metaEventsSearchSchema", () => {
  it("keeps the scope fields alongside its own", () => {
    expect(
      metaEventsSearchSchema.parse({ q: "vienna", by: "players", dir: "asc", tier: "premier" }),
    ).toMatchObject({ q: "vienna", by: "players", dir: "asc", tier: "premier" });
  });

  it("drops a sort a stale bookmark names but the page no longer has", () => {
    const parsed = metaEventsSearchSchema.parse({ by: "organizer", dir: "sideways" });
    expect(parsed.by).toBeUndefined();
    expect(parsed.dir).toBeUndefined();
  });

  it("keeps the scope fields a bad sort travelled with", () => {
    expect(metaEventsSearchSchema.parse({ by: "organizer", country: "AT" })).toMatchObject({
      country: "AT",
    });
  });

  it("parses an empty URL", () => {
    expect(metaEventsSearchSchema.parse({})).toEqual({});
  });
});
