import type {
  DistributionChannel,
  DistributionChannelWithCount,
  Printing,
  PrintingDistributionChannel,
} from "@openrift/shared";
import { beforeEach, describe, expect, it } from "vitest";

import { resetIdCounter, stubPrinting } from "@/test/factories";

import { buildPromoTree, computeLanguageAggregates } from "./promos-tree";

function stubChannel(
  overrides: Partial<DistributionChannelWithCount> = {},
): DistributionChannelWithCount {
  return {
    id: overrides.id ?? "ch",
    slug: overrides.slug ?? "ch",
    label: overrides.label ?? "Channel",
    description: overrides.description ?? null,
    kind: overrides.kind ?? "event",
    parentId: overrides.parentId ?? null,
    childrenLabel: overrides.childrenLabel ?? null,
    cardCount: overrides.cardCount ?? 0,
    printingCount: overrides.printingCount ?? 0,
  };
}

function linkTo(channel: DistributionChannel): PrintingDistributionChannel {
  return {
    channel,
    distributionNote: null,
    ancestorLabels: [],
  };
}

function indexByChannel(printings: Printing[]): Map<string, Printing[]> {
  const byChannel = new Map<string, Printing[]>();
  for (const printing of printings) {
    for (const link of printing.distributionChannels) {
      const list = byChannel.get(link.channel.id);
      if (list) {
        list.push(printing);
      } else {
        byChannel.set(link.channel.id, [printing]);
      }
    }
  }
  return byChannel;
}

describe("buildPromoTree", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("counts each printing once per subtree even when it links to multiple sibling channels", () => {
    const parent = stubChannel({ id: "parent", label: "Regional Event" });
    const houston = stubChannel({ id: "houston", label: "Houston", parentId: "parent" });
    const dallas = stubChannel({ id: "dallas", label: "Dallas", parentId: "parent" });

    // One printing distributed at both Houston and Dallas — must not inflate
    // the "Regional Event" parent to 2.
    const shared = stubPrinting({
      id: "shared",
      distributionChannels: [linkTo(houston), linkTo(dallas)],
    });
    // Another printing only at Houston.
    const houstonOnly = stubPrinting({
      id: "houston-only",
      distributionChannels: [linkTo(houston)],
    });

    const tree = buildPromoTree([parent, houston, dallas], indexByChannel([shared, houstonOnly]));

    expect(tree).toHaveLength(1);
    const parentNode = tree[0];
    expect(parentNode.localPrintingCount).toBe(2);
    const [houstonNode, dallasNode] = parentNode.children;
    expect(houstonNode.localPrintingCount).toBe(2);
    expect(dallasNode.localPrintingCount).toBe(1);
  });

  it("counts distinct printings across deeper descendants", () => {
    const root = stubChannel({ id: "root", label: "Promo Packs" });
    const wave1 = stubChannel({ id: "wave1", label: "Wave 1", parentId: "root" });
    const wave2 = stubChannel({ id: "wave2", label: "Wave 2", parentId: "root" });

    const both = stubPrinting({ id: "both", distributionChannels: [linkTo(wave1), linkTo(wave2)] });
    const wave1Only = stubPrinting({ id: "wave1-only", distributionChannels: [linkTo(wave1)] });
    const wave2Only = stubPrinting({ id: "wave2-only", distributionChannels: [linkTo(wave2)] });

    const tree = buildPromoTree([root, wave1, wave2], indexByChannel([both, wave1Only, wave2Only]));

    expect(tree[0].localPrintingCount).toBe(3);
  });

  it("returns zero count for channels with no printings in their subtree", () => {
    const channel = stubChannel({ id: "empty", label: "Empty" });
    const tree = buildPromoTree([channel], new Map());
    expect(tree[0].localPrintingCount).toBe(0);
    expect(tree[0].subtreePrintingIds.size).toBe(0);
  });
});

describe("computeLanguageAggregates", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  it("reports distinct printing and card counts per language", () => {
    const channel = stubChannel({ id: "ch" });
    const card = nextCardId();
    const enA = stubPrinting({
      cardId: card,
      language: "EN",
      distributionChannels: [linkTo(channel)],
    });
    const enB = stubPrinting({
      cardId: nextCardId(),
      language: "EN",
      distributionChannels: [linkTo(channel)],
    });
    const de = stubPrinting({
      cardId: card,
      language: "DE",
      distributionChannels: [linkTo(channel)],
    });

    const aggregates = computeLanguageAggregates([enA, enB, de]);

    expect(aggregates.get("EN")).toEqual({ printingCount: 2, cardCount: 2 });
    expect(aggregates.get("DE")).toEqual({ printingCount: 1, cardCount: 1 });
  });

  it("ignores printings with no distribution channels", () => {
    const channel = stubChannel({ id: "ch" });
    const listed = stubPrinting({ language: "EN", distributionChannels: [linkTo(channel)] });
    const orphan = stubPrinting({ language: "EN", distributionChannels: [] });

    const aggregates = computeLanguageAggregates([listed, orphan]);

    expect(aggregates.get("EN")).toEqual({ printingCount: 1, cardCount: 1 });
  });
});

let cardCounter = 0;
function nextCardId(): string {
  cardCounter++;
  return `card-${cardCounter}`;
}
