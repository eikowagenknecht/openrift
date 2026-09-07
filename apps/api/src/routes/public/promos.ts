import { promosContract } from "@openrift/shared/contracts/promos";
import type { PromosListResponse } from "@openrift/shared/types/api/catalog";
import type { DistributionChannelWithCount } from "@openrift/shared/types/catalog";
import { implement } from "@orpc/server";

import {
  buildCardsResponse,
  buildPrintingsResponse,
  loadPrintingDecorations,
} from "../../lib/printing-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(promosContract).$context<ApiContext>().use(requireUser);

/**
 * Scoped to one language: serving every language put enough into the SSR
 * stream to blank the page. `languages` still names all of them.
 */
export const promosRouter = {
  list: os.list.handler(async ({ input, context }): Promise<PromosListResponse> => {
    const repos = context.repos;
    const { catalog, distributionChannels } = repos;

    const [allChannels, allPrintingRows, allSets] = await Promise.all([
      distributionChannels.listAll(),
      catalog.channelDistributedPrintings(),
      catalog.sets(),
    ]);

    const languages = [...new Set(allPrintingRows.map((p) => p.language))].toSorted();
    const printingRows = allPrintingRows.filter((p) => p.language === input.language);

    const cardIds = [...new Set(printingRows.map((p) => p.cardId))];
    const printingIds = printingRows.map((p) => p.id);
    const referencedSetIds = new Set(printingRows.map((p) => p.setId));
    const sets = allSets.filter((set) => referencedSetIds.has(set.id));

    const [cardRows, banRows, errataRows, imageRows, decorations] = await Promise.all([
      catalog.cardsByIds(cardIds),
      catalog.cardBansByCardIds(cardIds),
      catalog.cardErrataByCardIds(cardIds),
      catalog.printingImagesByPrintingIds(printingIds),
      loadPrintingDecorations(repos, printingIds),
    ]);

    const cards = buildCardsResponse(cardRows, banRows, errataRows);
    const printings = buildPrintingsResponse(printingRows, imageRows, decorations);

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

    return { channels, cards, printings, sets, languages };
  }),
};
