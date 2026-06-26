import type {
  CardDetailResponse,
  CatalogCardResponse,
  CatalogPrintingResponse,
} from "@openrift/shared";
import { cardsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { loadMarkerAndChannelMaps, resolveMarkers } from "../../utils/printing-response.js";

const os = implement(cardsContract).$context<ApiContext>().use(requireUser);

/**
 * The public card-detail contract. An unknown slug returns a typed NOT_FOUND.
 * Prices are NOT inlined — they are served separately by `/prices` (CACHE-1).
 */
export const cardsRouter = {
  detail: os.detail.handler(async ({ input, context, errors }): Promise<CardDetailResponse> => {
    const repos = context.repos;
    const { catalog } = repos;

    const card = await catalog.cardBySlug(input.cardSlug);
    if (!card) {
      throw errors.NOT_FOUND({ message: `Card not found: ${input.cardSlug}` });
    }

    const [printingRows, imageRows, banRows, errataRow] = await Promise.all([
      catalog.printingsByCardId(card.id),
      catalog.printingImagesByCardId(card.id),
      catalog.cardBansByCardId(card.id),
      catalog.cardErrataByCardId(card.id),
    ]);

    const setIds = [...new Set(printingRows.map((p) => p.setId))];
    const printingIds = printingRows.map((p) => p.id);
    const [sets, markerChannelMaps] = await Promise.all([
      catalog.setsByIds(setIds),
      loadMarkerAndChannelMaps(repos, printingIds),
    ]);
    const { markerBySlug, channelsByPrinting } = markerChannelMaps;

    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    const errata = errataRow
      ? {
          correctedRulesText: errataRow.correctedRulesText,
          correctedEffectText: errataRow.correctedEffectText,
          source: errataRow.source,
          sourceUrl: errataRow.sourceUrl,
          effectiveDate: errataRow.effectiveDate ? String(errataRow.effectiveDate) : null,
        }
      : null;

    const cardResponse: CatalogCardResponse = {
      ...card,
      errata,
      bans: banRows.map((b) => ({
        formatId: b.formatId,
        formatName: b.formatName,
        bannedAt: b.bannedAt,
        reason: b.reason,
      })),
    };

    const printings: CatalogPrintingResponse[] = printingRows.map(({ markerSlugs, ...rest }) => ({
      ...rest,
      markers: resolveMarkers(markerSlugs, markerBySlug),
      distributionChannels: channelsByPrinting.get(rest.id) ?? [],
      images: (imagesByPrinting.get(rest.id) ?? []).map((i) => ({
        face: i.face,
        imageId: i.imageId,
      })),
    }));

    return { card: cardResponse, printings, sets };
  }),
};
