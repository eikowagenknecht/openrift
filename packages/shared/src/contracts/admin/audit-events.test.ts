import { describe, expect, it } from "vitest";

import { adminAuditEventsQuerySchema } from "./audit-events.js";

describe("adminAuditEventsQuerySchema", () => {
  it("rejects a garbage cursor", () => {
    expect(adminAuditEventsQuerySchema.safeParse({ cursor: "not-a-date" }).success).toBe(false);
  });

  it("rejects a garbage cursor with a composite-looking suffix", () => {
    expect(adminAuditEventsQuerySchema.safeParse({ cursor: "not-a-date_ae-123" }).success).toBe(
      false,
    );
  });

  it("rejects a composite cursor with an empty id", () => {
    expect(
      adminAuditEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z_" }).success,
    ).toBe(false);
  });

  it("accepts a legacy timestamp-only cursor", () => {
    expect(
      adminAuditEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z" }).success,
    ).toBe(true);
  });

  it("accepts a composite timestamp_id cursor, the shape buildKeysetCursor produces", () => {
    expect(
      adminAuditEventsQuerySchema.safeParse({ cursor: "2025-01-01T00:00:00.000Z_ae-123" }).success,
    ).toBe(true);
  });

  it("accepts no cursor", () => {
    expect(adminAuditEventsQuerySchema.safeParse({}).success).toBe(true);
  });

  it("rejects limit under 1", () => {
    expect(adminAuditEventsQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});
