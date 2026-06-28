import type { CopyResponse, Printing } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import { buildStacks } from "@/hooks/use-stacked-copies";
import { stubPrinting } from "@/test/factories";

const standard = stubPrinting({ id: "pr-standard", cardId: "card-1", shortCode: "UNL-001" });
const foil = stubPrinting({
  id: "pr-foil",
  cardId: "card-1",
  shortCode: "UNL-001",
  finish: "foil",
});
const printingById = new Map<string, Printing>([
  [standard.id, standard],
  [foil.id, foil],
]);

function copy(id: string, printingId: string, collectionId: string, groupId: string | null = null) {
  return { id, printingId, collectionId, groupId } satisfies CopyResponse;
}

describe("buildStacks", () => {
  it("excludes group-collection copies on the unscoped (All Cards) aggregate", () => {
    // 9 personal + 21 group must stack to 9, matching the personal owned badge.
    const copies = [
      ...Array.from({ length: 9 }, (_unused, index) =>
        copy(`p-${index}`, standard.id, "col-personal"),
      ),
      ...Array.from({ length: 21 }, (_unused, index) =>
        copy(`g-${index}`, standard.id, "col-group", "group-1"),
      ),
    ];
    const stacks = buildStacks(copies, printingById, undefined);
    expect(stacks).toHaveLength(1);
    expect(stacks[0].printingId).toBe(standard.id);
    expect(stacks[0].copyIds).toHaveLength(9);
  });

  it("drops a card owned only in a group collection from the personal aggregate", () => {
    const copies = [copy("g-1", foil.id, "col-group", "group-1")];
    expect(buildStacks(copies, printingById, undefined)).toEqual([]);
  });

  it("includes every copy when scoped to a specific collection, group or not", () => {
    // Scoped to the group collection's own id → all 3 of its copies count.
    const copies = [
      copy("g-1", standard.id, "col-group", "group-1"),
      copy("g-2", standard.id, "col-group", "group-1"),
      copy("g-3", standard.id, "col-group", "group-1"),
    ];
    const stacks = buildStacks(copies, printingById, "col-group");
    expect(stacks).toHaveLength(1);
    expect(stacks[0].copyIds).toHaveLength(3);
  });

  it("skips copies whose printing is unknown", () => {
    const copies = [copy("x-1", "pr-missing", "col-personal")];
    expect(buildStacks(copies, printingById, undefined)).toEqual([]);
  });
});
