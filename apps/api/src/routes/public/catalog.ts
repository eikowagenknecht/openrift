import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  CatalogResponse,
  Marketplace,
} from "@openrift/shared";
import { catalogResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";

const getCatalog = createRoute({
  method: "get",
  path: "/catalog",
  tags: ["Catalog"],
  responses: {
    200: {
      content: { "application/json": { schema: catalogResponseSchema } },
      description: "Full card catalog",
    },
  },
});

const catalogApp = new OpenAPIHono<{ Variables: Variables }>();
catalogApp.use("/catalog", etag());
export const catalogRoute = catalogApp
  /**
   * `GET /catalog` — Returns the full card catalog as {@link CatalogResponse}.
   *
   * Returns a normalized response with cards keyed by ID, a flat printings
   * array (referencing cards by `cardId`), and a simple sets list. Latest
   * market prices are included directly on each printing.
   */
  .openapi(getCatalog, async (c) => {
    const { catalog, marketplace } = c.get("repos");

    const [
      sets,
      cardRows,
      printingRows,
      imageRows,
      priceRows,
      banRows,
      errataRows,
      totalCopies,
      languages,
    ] = await Promise.all([
      catalog.sets(),
      catalog.cards(),
      catalog.printings(),
      catalog.printingImages(),
      marketplace.latestPrices(),
      catalog.cardBans(),
      catalog.cardErrata(),
      catalog.totalCopies(),
      catalog.languages(),
    ]);

    // Build per-printing, per-marketplace price map
    const pricesByPrinting = new Map<string, Partial<Record<Marketplace, number>>>();
    for (const row of priceRows) {
      let entry = pricesByPrinting.get(row.printingId);
      if (!entry) {
        entry = {};
        pricesByPrinting.set(row.printingId, entry);
      }
      entry[row.marketplace as Marketplace] = centsToDollars(row.marketCents);
    }

    // Group active bans by card
    const bansByCard = Map.groupBy(banRows, (r) => r.cardId);

    // Build errata lookup (one per card at most)
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

    // Build images lookup (null URLs already filtered at the DB level)
    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    // Build flat printings array
    const printings: CatalogPrintingResponse[] = printingRows.map((row) => {
      const prices = pricesByPrinting.get(row.id);
      return {
        ...row,
        images: (imagesByPrinting.get(row.id) ?? []).map((i) => ({ face: i.face, url: i.url })),
        ...(prices?.tcgplayer !== undefined && { marketPrice: prices.tcgplayer }),
        ...(prices && { marketPrices: prices }),
      };
    });

    const content: CatalogResponse = {
      sets,
      cards,
      printings,
      totalCopies,
      languages,
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(content);
  });
