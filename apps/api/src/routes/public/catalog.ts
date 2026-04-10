import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { centsToDollars } from "@openrift/shared";
import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
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
   * Cards and printings are both returned as maps keyed by their own id; the
   * id is therefore omitted from each value (identity lives in the key). Sets
   * stay as an array. Latest market prices are included on each printing.
   */
  .openapi(getCatalog, async (c) => {
    const { catalog, marketplace } = c.get("repos");

    const [sets, cardRows, printingRows, imageRows, priceRows, banRows, errataRows, totalCopies] =
      await Promise.all([
        catalog.sets(),
        catalog.cards(),
        catalog.printings(),
        catalog.printingImages(),
        marketplace.latestPrices(),
        catalog.cardBans(),
        catalog.cardErrata(),
        catalog.totalCopies(),
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

    const cards: Record<string, CatalogResponseCardValue> = {};
    for (const { id, ...rest } of cardRows) {
      cards[id] = {
        ...rest,
        errata: errataByCard.get(id) ?? null,
        bans: (bansByCard.get(id) ?? []).map((b) => ({
          formatId: b.formatId,
          formatName: b.formatName,
          bannedAt: b.bannedAt,
          reason: b.reason,
        })),
      };
    }

    // Build images lookup (null URLs already filtered at the DB level)
    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    const printings: Record<string, CatalogResponsePrintingValue> = {};
    for (const { id, ...rest } of printingRows) {
      const prices = pricesByPrinting.get(id);
      printings[id] = {
        ...rest,
        images: (imagesByPrinting.get(id) ?? []).map((i) => ({ face: i.face, url: i.url })),
        ...(prices?.tcgplayer !== undefined && { marketPrice: prices.tcgplayer }),
        ...(prices && { marketPrices: prices }),
      };
    }

    const content: CatalogResponse = {
      sets,
      cards,
      printings,
      totalCopies,
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(content);
  });
