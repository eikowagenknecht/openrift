import type { EnumOrders } from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import type { CardViewerItem } from "@/components/card-viewer-types";
import type { GroupInfo } from "@/components/cards/card-grid-types";
import type { EnumLabels } from "@/hooks/use-enums";
import { resetIdCounter, stubPrinting } from "@/test/factories";

import { buildGroups, groupItemsBySet } from "./card-groups";

beforeEach(() => {
  resetIdCounter();
});

const ORDERS: EnumOrders = {
  rarities: [],
  domains: [],
  cardTypes: [],
  superTypes: [],
  artVariants: [],
  finishes: [],
};

const LABELS: EnumLabels = {
  finishes: {},
  rarities: {},
  domains: {},
  cardTypes: {},
  superTypes: {},
  artVariants: {},
};

function item(setId: string): CardViewerItem {
  const printing = stubPrinting({ setId });
  return { id: printing.id, printing };
}

const setOrder: GroupInfo[] = [
  { id: "set-a", slug: "AAA", name: "Set A" },
  { id: "set-b", slug: "BBB", name: "Set B" },
];

describe("groupItemsBySet", () => {
  it("groups items into the given set order", () => {
    const groups = groupItemsBySet([item("set-b"), item("set-a"), item("set-b")], setOrder);
    expect(groups.map((group) => group.group.id)).toEqual(["set-a", "set-b"]);
    expect(groups.find((group) => group.group.id === "set-b")?.items).toHaveLength(2);
  });

  it("drops sets with no matching items", () => {
    const groups = groupItemsBySet([item("set-a")], setOrder);
    expect(groups.map((group) => group.group.id)).toEqual(["set-a"]);
  });
});

describe("buildGroups", () => {
  const items = [item("set-a"), item("set-b")];

  it("returns a single _all group when ungrouped", () => {
    const groups = buildGroups(items, "none", setOrder, "asc", ORDERS, LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0].group.id).toBe("_all");
    expect(groups[0].items).toHaveLength(2);
  });

  it("groups by set in the configured order", () => {
    const groups = buildGroups(items, "set", setOrder, "asc", ORDERS, LABELS);
    expect(groups.map((group) => group.group.id)).toEqual(["set-a", "set-b"]);
  });

  it("reverses the group order when groupDir is desc", () => {
    const groups = buildGroups(items, "set", setOrder, "desc", ORDERS, LABELS);
    expect(groups.map((group) => group.group.id)).toEqual(["set-b", "set-a"]);
  });

  it("falls back to a single _all group when set grouping has no setOrder", () => {
    const groups = buildGroups(items, "set", undefined, "asc", ORDERS, LABELS);
    expect(groups).toHaveLength(1);
    expect(groups[0].group.id).toBe("_all");
  });
});
