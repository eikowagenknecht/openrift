import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import type {
  CatalogResponse,
  CatalogResponseCardValue,
  CatalogResponsePrintingValue,
} from "@openrift/shared";
import { catalogResponseSchema } from "@openrift/shared/response-schemas";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";
import { toCardImageVariants } from "../../utils/card-image.js";

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
   * stay as an array.
   *
   * Prices live on a separate `/api/v1/prices` endpoint with its own cache
   * lifetime, so the catalog ETag stays stable across daily price refreshes.
   * Clients compose the two via the `useCards()` + `usePrices()` hook pair.
   */
  .openapi(getCatalog, async (c) => {
    const { catalog } = c.get("repos");

    const [sets, cardRows, printingRows, imageRows, banRows, errataRows, totalCopies] =
      await Promise.all([
        catalog.sets(),
        catalog.cards(),
        catalog.printings(),
        catalog.printingImages(),
        catalog.cardBans(),
        catalog.cardErrata(),
        catalog.totalCopies(),
      ]);

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
      printings[id] = {
        ...rest,
        images: (imagesByPrinting.get(id) ?? []).map((i) => ({
          face: i.face,
          ...toCardImageVariants(i.url),
        })),
      };
    }

    const content: CatalogResponse = {
      sets,
      cards,
      printings,
      totalCopies,
    };

    // Catalog data only changes when sets/cards/printings ship — typically
    // weeks apart. Long max-age + SWR keeps caches warm across refreshes.
    c.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=86400");
    return c.json(content);
  });
