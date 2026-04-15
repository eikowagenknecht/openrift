import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  Marketplace,
  PriceMap,
  SetDetailResponse,
  SetListResponse,
} from "@openrift/shared";
import { setDetailResponseSchema, setListResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";
import { toCardImageVariants } from "../../utils/card-image.js";
import { loadMarkerAndChannelMaps, resolveMarkers } from "../../utils/printing-response.js";

const setSlugParamSchema = z.object({ setSlug: z.string() });

const getSetList = createRoute({
  method: "get",
  path: "/sets",
  tags: ["Sets"],
  responses: {
    200: {
      content: { "application/json": { schema: setListResponseSchema } },
      description: "List of all card sets",
    },
  },
});

const getSetDetail = createRoute({
  method: "get",
  path: "/sets/{setSlug}",
  tags: ["Sets"],
  request: { params: setSlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: setDetailResponseSchema } },
      description: "Set detail with all cards and printings",
    },
  },
});

const setsApp = new OpenAPIHono<{ Variables: Variables }>();
setsApp.use("/sets", etag());
setsApp.use("/sets/:setSlug", etag());
export const setsRoute = setsApp
  /**
   * `GET /sets` — Returns all card sets with card and printing counts.
   */
  .openapi(getSetList, async (c) => {
    const { catalog } = c.get("repos");

    const [allSets, coverImages, counts] = await Promise.all([
      catalog.sets(),
      catalog.setCoverImages(),
      catalog.setCountsAll(),
    ]);
    const entries = allSets.map((set) => {
      const setCounts = counts.get(set.id);
      return {
        ...set,
        cardCount: setCounts?.cardCount ?? 0,
        printingCount: setCounts?.printingCount ?? 0,
        coverImage: toCardImageVariants(coverImages.get(set.id) ?? null),
      };
    });

    const content: SetListResponse = { sets: entries };
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json(content);
  })
  /**
   * `GET /sets/:setSlug` — Returns a set with all its cards and printings.
   */
  .openapi(getSetDetail, async (c) => {
    const { setSlug } = c.req.valid("param");
    const repos = c.get("repos");
    const { catalog, marketplace } = repos;

    const set = await catalog.setBySlug(setSlug);
    if (!set) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Set not found: ${setSlug}`);
    }

    const [printingRows, imageRows] = await Promise.all([
      catalog.printingsBySetId(set.id),
      catalog.printingImagesBySetId(set.id),
    ]);

    // Get unique card IDs and printing IDs for scoped lookups
    const cardIds = [...new Set(printingRows.map((p) => p.cardId))];
    const printingIds = printingRows.map((p) => p.id);
    const [cardRows, banRows, errataRows, priceRows, markerChannelMaps] = await Promise.all([
      catalog.cardsByIds(cardIds),
      catalog.cardBansByCardIds(cardIds),
      catalog.cardErrataByCardIds(cardIds),
      marketplace.latestPricesForPrintings(printingIds),
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

    // Per-printing price map. Sibling field on the response — used for SSR
    // JSON-LD; runtime UI reads prices through the global usePrices() hook.
    const prices: PriceMap = {};
    for (const row of priceRows) {
      let entry = prices[row.printingId];
      if (!entry) {
        entry = {};
        prices[row.printingId] = entry;
      }
      entry[row.marketplace as Marketplace] = centsToDollars(row.marketCents);
    }

    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    const printings: CatalogPrintingResponse[] = printingRows.map(({ markerSlugs, ...rest }) => ({
      ...rest,
      markers: resolveMarkers(markerSlugs, markerBySlug),
      distributionChannels: channelsByPrinting.get(rest.id) ?? [],
      images: (imagesByPrinting.get(rest.id) ?? []).map((i) => ({
        face: i.face,
        ...toCardImageVariants(i.url),
      })),
    }));

    const content: SetDetailResponse = { set, cards, printings, prices };
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json(content);
  });
