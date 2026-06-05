import { createRoute } from "@hono/zod-openapi";
import { ERROR_CODES } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  CardDetailResponse,
} from "@openrift/shared";
import { cardDetailResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";
import { z } from "zod";

import { AppError } from "../../errors.js";
import { createApiApp } from "../../openapi.js";
import { loadMarkerAndChannelMaps, resolveMarkers } from "../../utils/printing-response.js";

const cardSlugParamSchema = z.object({ cardSlug: z.string().min(1) });

const getCardDetail = createRoute({
  method: "get",
  path: "/cards/{cardSlug}",
  tags: ["Cards"],
  request: { params: cardSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: cardDetailResponseSchema } },
      description: "Card detail with all printings",
    },
  },
});

const cardsApp = createApiApp();
cardsApp.use("/cards/:cardSlug", etag());
export const cardsRoute = cardsApp
  /**
   * `GET /cards/:cardSlug` — Returns a single card with all its printings.
   *
   * Lightweight alternative to the full catalog endpoint, designed for SSR
   * card detail pages. Includes card data, all printings with images, and the
   * sets those printings belong to. Prices are NOT inlined — they are served
   * separately by `/prices` (CACHE-1).
   */
  .openapi(getCardDetail, async (c) => {
    const { cardSlug } = c.req.valid("param");
    const repos = c.get("repos");
    const { catalog } = repos;

    const card = await catalog.cardBySlug(cardSlug);
    if (!card) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Card not found: ${cardSlug}`);
    }

    const [printingRows, imageRows, banRows, errataRow] = await Promise.all([
      catalog.printingsByCardId(card.id),
      catalog.printingImagesByCardId(card.id),
      catalog.cardBansByCardId(card.id),
      catalog.cardErrataByCardId(card.id),
    ]);

    // Collect unique set IDs from printings
    const setIds = [...new Set(printingRows.map((p) => p.setId))];
    const printingIds = printingRows.map((p) => p.id);
    const [sets, markerChannelMaps] = await Promise.all([
      catalog.setsByIds(setIds),
      loadMarkerAndChannelMaps(repos, printingIds),
    ]);
    const { markerBySlug, channelsByPrinting } = markerChannelMaps;

    // Build images lookup
    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    // Build errata
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

    const content: CardDetailResponse = {
      card: cardResponse,
      printings,
      sets,
    };

    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json(content);
  });
