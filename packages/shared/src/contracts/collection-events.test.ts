import { describe, expect, it } from "vitest";

import { collectionEventsQuerySchema } from "./collection-events.js";

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

  it("accepts a composite timestamp_id cursor, the shape buildKeysetCursor produces", () => {
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
