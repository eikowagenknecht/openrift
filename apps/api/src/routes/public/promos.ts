import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  Marketplace,
  PriceMap,
  PromoListResponse,
  PromoTypeWithCount,
} from "@openrift/shared";
import { promoListResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";
import { toCardImageVariants } from "../../utils/card-image.js";

const getPromoList = createRoute({
  method: "get",
  path: "/promos",
  tags: ["Promos"],
  responses: {
    200: {
      content: { "application/json": { schema: promoListResponseSchema } },
      description: "All promo types with their printings and cards",
    },
  },
});

const promosApp = new OpenAPIHono<{ Variables: Variables }>();
promosApp.use("/promos", etag());
export const promosRoute = promosApp.openapi(getPromoList, async (c) => {
  const { catalog, marketplace } = c.get("repos");

  const [promoTypeRows, printingRows] = await Promise.all([
    catalog.promoTypesList(),
    catalog.promoPrintings(),
  ]);

  const cardIds = [...new Set(printingRows.map((p) => p.cardId))];
  const printingIds = printingRows.map((p) => p.id);

  const [cardRows, banRows, errataRows, imageRows, priceRows] = await Promise.all([
    catalog.cardsByIds(cardIds),
    catalog.cardBansByCardIds(cardIds),
    catalog.cardErrataByCardIds(cardIds),
    catalog.printingImagesByPrintingIds(printingIds),
    marketplace.latestPricesForPrintings(printingIds),
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

  // Per-printing price map
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

  const printings: CatalogPrintingResponse[] = printingRows.map((row) => ({
    ...row,
    images: (imagesByPrinting.get(row.id) ?? []).map((i) => ({
      face: i.face,
      ...toCardImageVariants(i.url),
    })),
  }));

  // Count cards and printings per promo type
  const printingsByPromo = Map.groupBy(printingRows, (p) => p.promoType?.id ?? "");
  const promoTypes: PromoTypeWithCount[] = promoTypeRows.map((pt) => {
    const ptPrintings = printingsByPromo.get(pt.id) ?? [];
    return {
      id: pt.id,
      slug: pt.slug,
      label: pt.label,
      description: pt.description,
      cardCount: new Set(ptPrintings.map((p) => p.cardId)).size,
      printingCount: ptPrintings.length,
    };
  });

  const content: PromoListResponse = { promoTypes, cards, printings, prices };
  c.header("Cache-Control", "public, max-age=300, stale-while-revalidate=600");
  return c.json(content);
});
