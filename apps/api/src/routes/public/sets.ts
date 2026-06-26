import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  SetDetailResponse,
  SetListResponse,
} from "@openrift/shared";
import { setsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { loadMarkerAndChannelMaps, resolveMarkers } from "../../utils/printing-response.js";

const os = implement(setsContract).$context<ApiContext>().use(requireUser);

/**
 * Public sets reads. An unknown slug returns a typed `errors.NOT_FOUND()`
 * (declared on the contract), so the web client sees it as a statically-known
 * error.
 */
export const setsRouter = {
  list: os.list.handler(async ({ context }): Promise<SetListResponse> => {
    const { catalog } = context.repos;

    const [allSets, coverImageIds, counts] = await Promise.all([
      catalog.sets(),
      catalog.setCoverImageIds(),
      catalog.setCountsAll(),
    ]);
    const entries = allSets.map((set) => {
      const setCounts = counts.get(set.id);
      return {
        ...set,
        cardCount: setCounts?.cardCount ?? 0,
        printingCount: setCounts?.printingCount ?? 0,
        coverImageId: coverImageIds.get(set.id) ?? null,
      };
    });
    return { sets: entries };
  }),

  detail: os.detail.handler(async ({ input, context, errors }): Promise<SetDetailResponse> => {
    const repos = context.repos;
    const { catalog } = repos;

    const set = await catalog.setBySlug(input.setSlug);
    if (!set) {
      throw errors.NOT_FOUND({ message: `Set not found: ${input.setSlug}` });
    }

    const [printingRows, imageRows] = await Promise.all([
      catalog.printingsBySetId(set.id),
      catalog.printingImagesBySetId(set.id),
    ]);

    // Get unique card IDs and printing IDs for scoped lookups
    const cardIds = [...new Set(printingRows.map((p) => p.cardId))];
    const printingIds = printingRows.map((p) => p.id);
    const [cardRows, banRows, errataRows, markerChannelMaps] = await Promise.all([
      catalog.cardsByIds(cardIds),
      catalog.cardBansByCardIds(cardIds),
      catalog.cardErrataByCardIds(cardIds),
      loadMarkerAndChannelMaps(repos, printingIds),
    ]);
    const { markerBySlug, channelsByPrinting } = markerChannelMaps;

    // Build card lookup with errata and bans
    const bansByCard = Map.groupBy(banRows, (r) => r.cardId);
    const errataByCard = new Map(
      errataRows.map((r) => [
        r.cardId,
        {
          correctedRulesText: r.correctedRulesText,
          correctedEffectText: r.correctedEffectText,
          source: r.source,
          sourceUrl: r.sourceUrl,
          effectiveDate: r.effectiveDate ? String(r.effectiveDate) : null,
        },
      ]),
    );

    const cards: Record<string, CatalogCardResponse> = Object.fromEntries(
      cardRows.map((r) => [
        r.id,
        {
          ...r,
          errata: errataByCard.get(r.id) ?? null,
          bans: (bansByCard.get(r.id) ?? []).map((b) => ({
            formatId: b.formatId,
            formatName: b.formatName,
            bannedAt: b.bannedAt,
            reason: b.reason,
          })),
        },
      ]),
    );

    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    const printings: CatalogPrintingResponse[] = printingRows.map(({ markerSlugs, ...rest }) => ({
      ...rest,
      markers: resolveMarkers(markerSlugs, markerBySlug),
      distributionChannels: channelsByPrinting.get(rest.id) ?? [],
      images: (imagesByPrinting.get(rest.id) ?? []).map((i) => ({
        face: i.face,
        imageId: i.imageId,
      })),
    }));

    return { set, cards, printings };
  }),
};
