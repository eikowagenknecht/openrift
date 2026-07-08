import { describe, expect, it } from "vitest";

import { formatAuditChanges } from "./audit-changes";

describe("formatAuditChanges", () => {
  it("pairs old and new values per field", () => {
    expect(formatAuditChanges({ energy: 2 }, { energy: 3 })).toEqual([
      { field: "energy", from: "2", to: "3" },
    ]);
  });

  it("covers the union of keys, with null for the missing side", () => {
    const changes = formatAuditChanges({ slug: "old-slug" }, { name: "New Name" });
    expect(changes).toEqual([
      { field: "slug", from: "old-slug", to: null },
      { field: "name", from: null, to: "New Name" },
    ]);
  });

  it("handles create events (old null)", () => {
    expect(formatAuditChanges(null, { name: "Fireball", types: ["spell"] })).toEqual([
      { field: "name", from: null, to: "Fireball" },
      { field: "types", from: null, to: '["spell"]' },
    ]);
  });

  it("handles delete events (new null)", () => {
    expect(formatAuditChanges({ slug: "gone" }, null)).toEqual([
      { field: "slug", from: "gone", to: null },
    ]);
  });

  it("returns an empty list when both sides are null", () => {
    expect(formatAuditChanges(null, null)).toEqual([]);
  });

  it("stringifies non-string values, keeping strings verbatim", () => {
    const changes = formatAuditChanges({ reason: null, active: false }, { markerSlugs: ["promo"] });
    expect(changes).toEqual([
      { field: "reason", from: "null", to: null },
      { field: "active", from: "false", to: null },
      { field: "markerSlugs", from: null, to: '["promo"]' },
    ]);
  });
});
