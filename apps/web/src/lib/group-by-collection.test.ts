import { beforeEach, describe, expect, it } from "vitest";

import type { GroupInfo } from "@/lib/card-group-types";
import type { CardViewerItem } from "@/lib/card-viewer-types";
import { resetIdCounter, stubPrinting } from "@/test/factories";

import { groupItemsByCollection, isCopiesOnlyGrouping } from "./group-by-collection";

beforeEach(() => {
  resetIdCounter();
});

function copy(collectionId?: string): CardViewerItem {
  const printing = stubPrinting({});
  return { id: `copy-${printing.id}`, printing, collectionId };
}

const collectionOrder: GroupInfo[] = [
  { id: "col-inbox", slug: "", name: "Inbox" },
  { id: "col-binder", slug: "", name: "Binder" },
  { id: "col-bulk", slug: "", name: "Bulk" },
];

describe("isCopiesOnlyGrouping", () => {
  it("is true only for the collection axis", () => {
    expect(isCopiesOnlyGrouping("collection")).toBe(true);
    expect(isCopiesOnlyGrouping("set")).toBe(false);
    expect(isCopiesOnlyGrouping("marker")).toBe(false);
  });
});

describe("groupItemsByCollection", () => {
  it("groups copies into the given collection order", () => {
    const groups = groupItemsByCollection(
      [copy("col-binder"), copy("col-inbox"), copy("col-binder")],
      collectionOrder,
    );
    expect(groups.map((group) => group.group.id)).toEqual(["col-inbox", "col-binder"]);
    expect(groups.map((group) => group.group.name)).toEqual(["Inbox", "Binder"]);
    expect(groups.find((group) => group.group.id === "col-binder")?.items).toHaveLength(2);
  });

  it("drops collections with no copies in the grid", () => {
    const groups = groupItemsByCollection([copy("col-bulk")], collectionOrder);
    expect(groups.map((group) => group.group.id)).toEqual(["col-bulk"]);
  });

  it("returns no groups for an empty grid", () => {
    expect(groupItemsByCollection([], collectionOrder)).toEqual([]);
  });

  it("collects copies of an unknown collection into a trailing bucket", () => {
    const groups = groupItemsByCollection([copy("col-gone"), copy("col-inbox")], collectionOrder);
    expect(groups.map((group) => group.group.name)).toEqual(["Inbox", "Other"]);
    expect(groups.at(-1)?.items).toHaveLength(1);
  });

  it("buckets copies with no collection id alongside the other unknowns", () => {
    const groups = groupItemsByCollection([copy(), copy("col-inbox")], collectionOrder);
    expect(groups.map((group) => group.group.name)).toEqual(["Inbox", "Other"]);
    expect(groups.flatMap((group) => group.items)).toHaveLength(2);
  });
});
