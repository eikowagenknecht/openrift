import { describe, expect, it } from "vitest";

import { asDragData } from "@/lib/dnd-data";

interface CardDrag {
  type: "card";
  cardId: string;
}

interface RowDrag {
  type: "row";
  rowIndex: number;
}

const TYPES = ["card", "row"] as const;

describe("asDragData", () => {
  it("returns the payload when its type is listed", () => {
    const payload = { type: "card", cardId: "c1" };
    expect(asDragData<CardDrag | RowDrag>(payload, TYPES)).toBe(payload);
  });

  it("narrows to the union member, keeping the extra fields", () => {
    const drag = asDragData<CardDrag | RowDrag>({ type: "row", rowIndex: 2 }, TYPES);
    expect(drag?.type === "row" ? drag.rowIndex : null).toBe(2);
  });

  it("rejects a payload from another drag context", () => {
    expect(asDragData<CardDrag>({ type: "sidebar-reorder-list", listId: "l1" }, ["card"])).toBe(
      undefined,
    );
  });

  it("rejects a payload with no type at all", () => {
    expect(asDragData<CardDrag>({ cardId: "c1" }, ["card"])).toBe(undefined);
  });

  it("returns undefined for a drag that carries no data", () => {
    expect(asDragData<CardDrag>(undefined, ["card"])).toBe(undefined);
  });

  it("returns undefined for null rather than throwing on a property read", () => {
    expect(asDragData<CardDrag>(null, ["card"])).toBe(undefined);
  });

  it("returns undefined for a primitive payload", () => {
    expect(asDragData<CardDrag>("card", ["card"])).toBe(undefined);
    expect(asDragData<CardDrag>(7, ["card"])).toBe(undefined);
  });

  it("accepts nothing when the caller lists no types", () => {
    expect(asDragData<CardDrag>({ type: "card", cardId: "c1" }, [])).toBe(undefined);
  });
});
