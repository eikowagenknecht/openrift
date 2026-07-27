import { describe, expect, it } from "vitest";

import { collectionEventsQuerySchema } from "./collection-events.js";

// Mirrors the copiesQuerySchema cursor regression tests in schemas.test.ts:
// a syntactically invalid cursor used to pass this schema (bare non-empty
// string), reach collection-events.ts's parseCursor, and produce an Invalid
// Date that propagated into the Kysely query as a 500 instead of a 400.
describe("collectionEventsQuerySchema", () => {
  it("rejects a garbage cursor", () => {
    expect(collectionEventsQuerySchema.safeParse({ cursor: "not-a-date" }).success).toBe(false);
  });

  it("rejects a garbage cursor with a composite-looking suffix", () => {
    expect(collectionEventsQuerySchema.safeParse({ cursor: "not-a-date_ce-123" }).success).toBe(
      false,
    );
  });

  it("rejects a composite cursor with an empty id", () => {
    expect(
      collectionEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z_" }).success,
    ).toBe(false);
  });

  it("accepts a legacy timestamp-only cursor", () => {
    expect(
      collectionEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("accepts a composite timestamp_id cursor, the shape buildEventsCursor produces", () => {
    expect(
      collectionEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z_ce-123" }).success,
    ).toBe(true);
  });

  it("accepts no cursor", () => {
    expect(collectionEventsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects limit under 1", () => {
    expect(collectionEventsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});
