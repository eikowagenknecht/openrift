import { describe, expect, it } from "vitest";

import { AppError } from "../errors.js";
import { buildKeysetCursor, keysetPage, parseKeysetCursor } from "./keyset-cursor.js";

const TIME = new Date("2026-01-15T12:30:00.000Z");

describe("buildKeysetCursor", () => {
  it("encodes createdAt and id into a single string", () => {
    expect(buildKeysetCursor(new Date("2026-01-15T12:30:00.000Z"), "abc-123")).toBe(
      "2026-01-15T12:30:00.000Z_abc-123",
    );
  });
});

describe("parseKeysetCursor", () => {
  it("splits the timestamp from the id", () => {
    expect(parseKeysetCursor(buildKeysetCursor(TIME, "abc-123"))).toEqual({
      time: TIME,
      id: "abc-123",
    });
  });

  it("keeps the id when it contains the separator", () => {
    expect(parseKeysetCursor(`${TIME.toISOString()}_a_b`)).toEqual({ time: TIME, id: "a_b" });
  });

  it("reads a legacy timestamp-only cursor as having no id", () => {
    expect(parseKeysetCursor(TIME.toISOString())).toEqual({ time: TIME, id: null });
  });

  it("rejects an unparseable cursor with a 400", () => {
    expect(() => parseKeysetCursor("not-a-date")).toThrow(AppError);
    expect(() => parseKeysetCursor("not-a-date")).toThrow(/Invalid cursor/u);
  });
});

describe("keysetPage", () => {
  const rows = [
    { createdAt: TIME, id: "a" },
    { createdAt: new Date("2026-01-15T12:29:00.000Z"), id: "b" },
    { createdAt: new Date("2026-01-15T12:28:00.000Z"), id: "c" },
  ];

  it("drops the over-fetched row and builds the cursor from the last kept one", () => {
    expect(keysetPage(rows, 2, (row) => row.id)).toEqual({
      items: ["a", "b"],
      nextCursor: buildKeysetCursor(rows[1].createdAt, "b"),
    });
  });

  it("reports no next cursor when the page is not full", () => {
    expect(keysetPage(rows, 5, (row) => row.id)).toEqual({
      items: ["a", "b", "c"],
      nextCursor: null,
    });
  });

  it("reports no next cursor for an empty row set", () => {
    expect(keysetPage([], 5, (row: { createdAt: Date; id: string }) => row.id)).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
