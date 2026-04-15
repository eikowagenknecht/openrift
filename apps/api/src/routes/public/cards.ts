import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  CardDetailResponse,
  Marketplace,
  PriceMap,
} from "@openrift/shared";
import { cardDetailResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { toCardImageVariants } from "../../utils/card-image.js";
import { loadMarkerAndChannelMaps, resolveMarkers } from "../../utils/printing-response.js";

const cardSlugParamSchema = z.object({ cardSlug: z.string() });

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

const cardsApp = new OpenAPIHono<{ Variables: Variables }>();
cardsApp.use("/cards/:cardSlug", etag());
export const cardsRoute = cardsApp
  /**
   * `GET /cards/:cardSlug` — Returns a single card with all its printings.
   *
   * Lightweight alternative to the full catalog endpoint, designed for SSR
   * card detail pages. Includes card data, all printings with images and
   * prices, and the sets those printings belong to.
   */
  .openapi(getCardDetail, async (c) => {
    const { cardSlug } = c.req.valid("param");
    const repos = c.get("repos");
    const { catalog, marketplace } = repos;

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
    const [sets, priceRows, markerChannelMaps] = await Promise.all([
      catalog.setsByIds(setIds),
      marketplace.latestPricesForPrintings(printingIds),
      loadMarkerAndChannelMaps(repos, printingIds),
    ]);
    const { markerBySlug, channelsByPrinting } = markerChannelMaps;

    // Per-printing price map. Returned as a sibling field on the response so
    // SSR head() can synchronously read it for Schema.org Product/Offer JSON-LD;
    // runtime UI reads prices through the global usePrices() hook instead.
    const prices: PriceMap = {};
    for (const row of priceRows) {
      let entry = prices[row.printingId];
      if (!entry) {
        entry = {};
        prices[row.printingId] = entry;
      }
      entry[row.marketplace as Marketplace] = centsToDollars(row.marketCents);
    }

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
        ...toCardImageVariants(i.url),
      })),
    }));

    const content: CardDetailResponse = {
      card: cardResponse,
      printings,
      sets,
      prices,
    };

    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json(content);
  });
