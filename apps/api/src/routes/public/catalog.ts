import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  CatalogResponse,
  Marketplace,
} from "@openrift/shared";
import { Hono } from "hono";
import { etag } from "hono/etag";

import type { Variables } from "../../types.js";

export const catalogRoute = new Hono<{ Variables: Variables }>()
  /**
   * `GET /catalog` — Returns the full card catalog as {@link CatalogResponse}.
   *
   * Returns a normalized response with cards keyed by ID, a flat printings
   * array (referencing cards by `cardId`), and a simple sets list. Latest
   * market prices are included directly on each printing.
   */
  .get("/catalog", etag(), async (c) => {
    const { catalog, marketplace } = c.get("repos");

    const [sets, cardRows, printingRows, imageRows, priceRows] = await Promise.all([
      catalog.sets(),
      catalog.cards(),
      catalog.printings(),
      catalog.printingImages(),
      marketplace.latestPrices(),
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

    const cards: Record<string, CatalogCardResponse> = Object.fromEntries(
      cardRows.map((r) => [r.id, r]),
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
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(content);
  });
