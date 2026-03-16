import { centsToDollars } from "@openrift/shared";
import type {
  CatalogCardResponse,
  CatalogPrintingResponse,
  CatalogResponse,
} from "@openrift/shared";
import { Hono } from "hono";
import { etag } from "hono/etag";

import { catalogRepo } from "../repositories/catalog.js";
import { marketplaceRepo } from "../repositories/marketplace.js";
import type { Variables } from "../types.js";

export const catalogRoute = new Hono<{ Variables: Variables }>()
  /**
   * `GET /catalog` — Returns the full card catalog as {@link CatalogResponse}.
   *
   * Returns a normalized response with cards keyed by ID, a flat printings
   * array (referencing cards by `cardId`), and a simple sets list. Latest
   * market prices are included directly on each printing.
   */
  .get("/catalog", etag(), async (c) => {
    const db = c.get("db");
    const catalog = catalogRepo(db);
    const marketplace = marketplaceRepo(db);

    const [sets, cardRows, printingRows, imageRows, priceRows] = await Promise.all([
      catalog.sets(),
      catalog.cards(),
      catalog.printings(),
      catalog.printingImages(),
      marketplace.latestPrices(),
    ]);

    const priceByPrinting = new Map(
      priceRows.map((r) => [r.printingId, centsToDollars(r.marketCents)]),
    );

    const cards: Record<string, CatalogCardResponse> = Object.fromEntries(
      cardRows.map((r) => [r.id, r]),
    );

    // Build images lookup (null URLs already filtered at the DB level)
    const imagesByPrinting = Map.groupBy(imageRows, (r) => r.printingId);

    // Build flat printings array
    const printings: CatalogPrintingResponse[] = printingRows.map((row) => ({
      ...row,
      images: (imagesByPrinting.get(row.id) ?? []).map((i) => ({ face: i.face, url: i.url })),
      ...(priceByPrinting.has(row.id) && { marketPrice: priceByPrinting.get(row.id) }),
    }));

    const content: CatalogResponse = {
      sets,
      cards,
      printings,
    };

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
    return c.json(content);
  });
