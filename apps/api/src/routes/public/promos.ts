import type { DistributionChannelWithCount, PromosListResponse } from "@openrift/shared";
import { promosContract } from "@openrift/shared/contracts/promos";
import { implement } from "@orpc/server";

import {
  buildCardsResponse,
  buildPrintingsResponse,
  loadMarkerAndChannelMaps,
} from "../../lib/printing-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(promosContract).$context<ApiContext>().use(requireUser);

/**
 * Public promos read: channel-distributed printings with their cards, bans,
 * errata, images, and per-channel rollup counts.
 */
export const promosRouter = {
  list: os.list.handler(async ({ context }): Promise<PromosListResponse> => {
    const repos = context.repos;
    const { catalog, distributionChannels } = repos;

    const [allChannels, printingRows] = await Promise.all([
      distributionChannels.listAll(),
      catalog.channelDistributedPrintings(),
    ]);

    const cardIds = [...new Set(printingRows.map((p) => p.cardId))];
    const printingIds = printingRows.map((p) => p.id);

    const [cardRows, banRows, errataRows, imageRows, markerChannelMaps] = await Promise.all([
      catalog.cardsByIds(cardIds),
      catalog.cardBansByCardIds(cardIds),
      catalog.cardErrataByCardIds(cardIds),
      catalog.printingImagesByPrintingIds(printingIds),
      loadMarkerAndChannelMaps(repos, printingIds),
    ]);
    const { markerBySlug, channelsByPrinting } = markerChannelMaps;

    const cards = buildCardsResponse(cardRows, banRows, errataRows);
    const printings = buildPrintingsResponse(
      printingRows,
      imageRows,
      markerBySlug,
      channelsByPrinting,
    );

    // Count cards + printings per channel by walking the resolved links.
    const channelCounts = new Map<string, { cards: Set<string>; printings: number }>();
    for (const printing of printings) {
      for (const link of printing.distributionChannels) {
        let entry = channelCounts.get(link.channel.id);
        if (!entry) {
          entry = { cards: new Set(), printings: 0 };
          channelCounts.set(link.channel.id, entry);
        }
        entry.cards.add(printing.cardId);
        entry.printings += 1;
      }
    }

    // Roll printing counts from each channel up to its ancestors so a parent
    // header can display the aggregate without each page re-walking the tree.
    const rollupCards = new Map<string, Set<string>>();
    const rollupPrintings = new Map<string, number>();
    const channelById = new Map(allChannels.map((ch) => [ch.id, ch]));
    for (const [leafId, leafCounts] of channelCounts) {
      let cursorId: string | null = leafId;
      while (cursorId !== null) {
        let cardSet = rollupCards.get(cursorId);
        if (!cardSet) {
          cardSet = new Set();
          rollupCards.set(cursorId, cardSet);
        }
        for (const cardId of leafCounts.cards) {
          cardSet.add(cardId);
        }
        rollupPrintings.set(cursorId, (rollupPrintings.get(cursorId) ?? 0) + leafCounts.printings);
        cursorId = channelById.get(cursorId)?.parentId ?? null;
      }
    }

    const channels: DistributionChannelWithCount[] = allChannels.map((ch) => ({
      id: ch.id,
      slug: ch.slug,
      label: ch.label,
      description: ch.description,
      kind: ch.kind,
      parentId: ch.parentId,
      childrenLabel: ch.childrenLabel,
      cardCount: rollupCards.get(ch.id)?.size ?? 0,
      printingCount: rollupPrintings.get(ch.id) ?? 0,
    }));

    return { channels, cards, printings };
  }),
};
