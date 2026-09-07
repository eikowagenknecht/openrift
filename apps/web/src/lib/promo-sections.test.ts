import type { DistributionChannelWithCount, Printing } from "@openrift/shared/types/catalog";
import { beforeEach, describe, expect, it } from "vitest";

import type { PromoSection } from "@/lib/promo-groupings";
import type { PromoTocItem } from "@/lib/promo-sections";
import {
  buildFlatRenderItems,
  collectChannelTocItems,
  collectFlatSectionTocItems,
  flattenChannelSections,
  formatLanguageAggregate,
} from "@/lib/promo-sections";
import type { ChannelNode } from "@/lib/promos-tree";
import { resetIdCounter, stubPrinting } from "@/test/factories";

function stubChannel(id: string, label: string): DistributionChannelWithCount {
  return {
    id,
    slug: id,
    label,
    description: null,
    kind: "event",
    parentId: null,
    childrenLabel: null,
    cardCount: 0,
    printingCount: 0,
  };
}

function node(
  id: string,
  label: string,
  printings: Printing[],
  children: ChannelNode[] = [],
): ChannelNode {
  const ids = new Set(printings.map((printing) => printing.id));
  for (const child of children) {
    for (const childId of child.subtreePrintingIds) {
      ids.add(childId);
    }
  }
  return {
    channel: stubChannel(id, label),
    children,
    printings,
    subtreePrintingIds: ids,
    localPrintingCount: ids.size,
  };
}

function stubPrintings(count: number): Printing[] {
  return Array.from({ length: count }, () => stubPrinting());
}

beforeEach(() => {
  resetIdCounter();
});

describe("formatLanguageAggregate", () => {
  it("uses plural words for multiple printings and cards", () => {
    expect(formatLanguageAggregate("English", 12, 7)).toBe(
      "OpenRift currently has data on 12 English promo printings across 7 cards.",
    );
  });

  it("uses singular words for a single printing and card", () => {
    expect(formatLanguageAggregate("German", 1, 1)).toBe(
      "OpenRift currently has data on 1 German promo printing across 1 card.",
    );
  });
});

describe("collectChannelTocItems", () => {
  it("indents by depth and skips empty branches", () => {
    const tree = [
      node("a", "Alpha", stubPrintings(1), [
        node("a1", "Alpha One", stubPrintings(1)),
        node("a2", "Alpha Two", []),
      ]),
      node("b", "Beta", stubPrintings(1)),
    ];
    const items: PromoTocItem[] = [];

    collectChannelTocItems(tree, "lang-EN", 0, items);

    expect(items).toEqual([
      { id: "lang-EN-ch-a", label: "Alpha", level: 0 },
      { id: "lang-EN-ch-a1", label: "Alpha One", level: 1 },
      { id: "lang-EN-ch-b", label: "Beta", level: 0 },
    ]);
  });
});

describe("collectFlatSectionTocItems", () => {
  it("anchors each section under the language prefix and kind", () => {
    const sections: PromoSection[] = [
      { id: "2024", label: "2024", printings: [] },
      { id: "2025", label: "2025", printings: [] },
    ];

    expect(collectFlatSectionTocItems(sections, "lang-EN", "year")).toEqual([
      { id: "lang-EN-year-2024", label: "2024", level: 0 },
      { id: "lang-EN-year-2025", label: "2025", level: 0 },
    ]);
  });
});

describe("buildFlatRenderItems", () => {
  it("keeps the section and titles it by its label", () => {
    const section: PromoSection = { id: "foil", label: "Foil", printings: stubPrintings(2) };

    expect(buildFlatRenderItems([section], "lang-EN", "marker")).toEqual([
      { section, sectionId: "lang-EN-marker-foil", title: "Foil" },
    ]);
  });
});

describe("flattenChannelSections", () => {
  it("renders a childless node as a leaf with a breadcrumb title", () => {
    const tree = [node("a", "Alpha", stubPrintings(2))];

    expect(flattenChannelSections(tree, "lang-EN")).toEqual([
      {
        kind: "leaf",
        node: tree[0],
        ancestors: [],
        parentAnchorIds: [],
        sectionId: "lang-EN-ch-a",
        title: "Alpha",
      },
    ]);
  });

  it("collapses a branch whose children are all small leaves", () => {
    const tree = [
      node(
        "a",
        "Alpha",
        [],
        [node("a1", "One", stubPrintings(4)), node("a2", "Two", stubPrintings(1))],
      ),
    ];

    const items = flattenChannelSections(tree, "lang-EN");

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("compact");
    expect(items[0]?.sectionId).toBe("lang-EN-ch-a");
  });

  it("walks into a branch whose child exceeds the compact threshold", () => {
    const tree = [node("a", "Alpha", [], [node("a1", "One", stubPrintings(5))])];

    const items = flattenChannelSections(tree, "lang-EN");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "leaf",
      ancestors: ["Alpha"],
      parentAnchorIds: ["lang-EN-ch-a"],
      sectionId: "lang-EN-ch-a1",
      title: "Alpha › One",
    });
  });

  it("hands the pending ancestor anchors to the first rendered descendant only", () => {
    const tree = [
      node(
        "a",
        "Alpha",
        [],
        [node("a1", "One", stubPrintings(5)), node("a2", "Two", stubPrintings(5))],
      ),
    ];

    const items = flattenChannelSections(tree, "lang-EN");

    expect(items.map((item) => item.parentAnchorIds)).toEqual([["lang-EN-ch-a"], []]);
  });

  it("skips nodes with no printings anywhere in their subtree", () => {
    const tree = [node("a", "Alpha", []), node("b", "Beta", stubPrintings(1))];

    expect(flattenChannelSections(tree, "lang-EN").map((item) => item.sectionId)).toEqual([
      "lang-EN-ch-b",
    ]);
  });
});
