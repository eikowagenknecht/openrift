import type { DistributionChannelWithCount, Printing } from "@openrift/shared";

export interface ChannelNode {
  channel: DistributionChannelWithCount;
  children: ChannelNode[];
  /** Direct printings on this channel (only leaves carry these). */
  printings: Printing[];
  /** Distinct printing ids across this node + all descendants. Used so a
   *  printing linked to multiple channels in the same subtree doesn't inflate
   *  the parent's count. */
  subtreePrintingIds: Set<string>;
  /** subtreePrintingIds.size — convenience for rendering. */
  localPrintingCount: number;
}

export interface LanguageAggregate {
  printingCount: number;
  cardCount: number;
}

/**
 * Build a tree of distribution channels with each leaf's printings attached.
 * Sibling order is sortOrder, then label. Parent counts are computed from the
 * union of descendant printing ids so a printing that links to multiple
 * channels in the same subtree is only counted once.
 *
 * @returns Root nodes of the channel tree.
 */
export function buildPromoTree(
  channels: DistributionChannelWithCount[],
  printingsByChannelId: Map<string, Printing[]>,
): ChannelNode[] {
  const byParent = new Map<string | null, DistributionChannelWithCount[]>();
  for (const channel of channels) {
    const list = byParent.get(channel.parentId);
    if (list) {
      list.push(channel);
    } else {
      byParent.set(channel.parentId, [channel]);
    }
  }
  function build(parentId: string | null): ChannelNode[] {
    const siblings = byParent.get(parentId);
    if (!siblings) {
      return [];
    }
    return siblings.map((channel) => {
      const children = build(channel.id);
      const printings = printingsByChannelId.get(channel.id) ?? [];
      const subtreePrintingIds = new Set<string>();
      for (const printing of printings) {
        subtreePrintingIds.add(printing.id);
      }
      for (const child of children) {
        for (const id of child.subtreePrintingIds) {
          subtreePrintingIds.add(id);
        }
      }
      return {
        channel,
        children,
        printings,
        subtreePrintingIds,
        localPrintingCount: subtreePrintingIds.size,
      };
    });
  }
  return build(null);
}

/**
 * Count distinct printings and distinct cards per language, limited to
 * printings that actually link to at least one distribution channel (i.e.
 * printings that will render on the page).
 *
 * @returns Map from language code to aggregate counts.
 */
export function computeLanguageAggregates(printings: Printing[]): Map<string, LanguageAggregate> {
  const printingIdsByLang = new Map<string, Set<string>>();
  const cardIdsByLang = new Map<string, Set<string>>();
  for (const printing of printings) {
    if (printing.distributionChannels.length === 0) {
      continue;
    }
    let printingIds = printingIdsByLang.get(printing.language);
    if (!printingIds) {
      printingIds = new Set();
      printingIdsByLang.set(printing.language, printingIds);
    }
    printingIds.add(printing.id);
    let cardIds = cardIdsByLang.get(printing.language);
    if (!cardIds) {
      cardIds = new Set();
      cardIdsByLang.set(printing.language, cardIds);
    }
    cardIds.add(printing.cardId);
  }
  const out = new Map<string, LanguageAggregate>();
  for (const [lang, printingIds] of printingIdsByLang) {
    out.set(lang, {
      printingCount: printingIds.size,
      cardCount: cardIdsByLang.get(lang)?.size ?? 0,
    });
  }
  return out;
}
