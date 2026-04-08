import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  Marketplace,
  SetDetailResponse,
  SetListResponse,
} from "@openrift/shared";
import { setDetailResponseSchema, setListResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";
import { z } from "zod";

import { AppError, ERROR_CODES } from "../../errors.js";
import type { Variables } from "../../types.js";

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

    const allSets = await catalog.sets();
    const coverImages = await catalog.setCoverImages();
    const entries = await Promise.all(
      allSets.map(async (set) => {
        const [cardCount, printingCount] = await Promise.all([
          catalog.setCardCount(set.id),
          catalog.setPrintingCount(set.id),
        ]);
        return { ...set, cardCount, printingCount, coverImageUrl: coverImages.get(set.id) ?? null };
      }),
    );

    const content: SetListResponse = { sets: entries };
    c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
    return c.json(content);
  })
  /**
   * `GET /sets/:setSlug` — Returns a set with all its cards and printings.
   */
  .openapi(getSetDetail, async (c) => {
    const { setSlug } = c.req.valid("param");
    const { catalog, marketplace } = c.get("repos");

    const set = await catalog.setBySlug(setSlug);
    if (!set) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, `Set not found: ${setSlug}`);
    }

    const [printingRows, imageRows, priceRows] = await Promise.all([
      catalog.printingsBySetId(set.id),
      catalog.printingImagesBySetId(set.id),
      marketplace.latestPrices(),
    ]);

    // Get unique card IDs and fetch those cards with bans/errata
    const cardIds = [...new Set(printingRows.map((p) => p.cardId))];
    const [cardRows, banRows, errataRows] = await Promise.all([
      catalog.cardsByIds(cardIds),
      catalog.cardBans(),
      catalog.cardErrata(),
    ]);

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
      cardRows
        .filter((r) => cardIds.includes(r.id))
        .map((r) => [
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

    // Build per-printing price map
    const printingIdSet = new Set(printingRows.map((p) => p.id));
    const pricesByPrinting = new Map<string, Partial<Record<Marketplace, number>>>();
    for (const row of priceRows) {
      if (!printingIdSet.has(row.printingId)) {
        continue;
      }
      let entry = pricesByPrinting.get(row.printingId);
      if (!entry) {
        entry = {};
        pricesByPrinting.set(row.printingId, entry);
      }
      entry[row.marketplace as Marketplace] = centsToDollars(row.marketCents);
    }

    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    const printings: CatalogPrintingResponse[] = printingRows.map((row) => {
      const prices = pricesByPrinting.get(row.id);
      return {
        ...row,
        images: (imagesByPrinting.get(row.id) ?? []).map((i) => ({ face: i.face, url: i.url })),
        ...(prices?.tcgplayer !== undefined && { marketPrice: prices.tcgplayer }),
        ...(prices && { marketPrices: prices }),
      };
    });

    const content: SetDetailResponse = { set, cards, printings };
    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(content);
  });
