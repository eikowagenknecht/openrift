import { centsToDollars } from "@openrift/shared";
import type { Card, CatalogPrinting, RiftboundCatalog } from "@openrift/shared";
import { Hono } from "hono";

import { catalogRepo } from "../repositories/catalog.js";
import { marketplaceRepo } from "../repositories/marketplace.js";
import type { Variables } from "../types.js";

export const catalogRoute = new Hono<{ Variables: Variables }>()
  /**
   * `GET /catalog` — Returns the full card catalog as {@link RiftboundCatalog}.
   *
   * Returns a normalized response with cards keyed by ID, a flat printings
   * array (referencing cards by `cardId`), and a simple sets list. Latest
   * market prices are included directly on each printing.
   */
  .get("/catalog", async (c) => {
    const db = c.get("db");
    const catalog = catalogRepo(db);
    const marketplace = marketplaceRepo(db);

    const [catalogTs, pricesTs] = await Promise.all([
      catalog.catalogLastModified(),
      marketplace.pricesLastModified(),
    ]);
    const combinedTs = Math.max(catalogTs.lastModified.getTime(), pricesTs.lastModified.getTime());
    const etag = `"catalog-${combinedTs}"`;

    if (c.req.header("If-None-Match") === etag) {
      return c.body(null, 304);
    }

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

    // CamelCasePlugin returns keys matching the Card interface, so direct assignment works.
    const cards: Record<string, Card> = Object.fromEntries(cardRows.map((r) => [r.id, r]));

    // Build images lookup
    const imagesByPrinting = Map.groupBy(
      imageRows.filter((r): r is typeof r & { url: string } => r.url !== null),
      (r) => r.printingId,
    );

    // Build flat printings array
    const printings: CatalogPrinting[] = [];
    for (const row of printingRows) {
      const card = cards[row.cardId];
      if (!card) {
        continue;
      }
      const marketPrice = priceByPrinting.get(row.id);
      printings.push({
        ...row,
        images: (imagesByPrinting.get(row.id) ?? []).map((i) => ({ face: i.face, url: i.url })),
        ...(marketPrice !== undefined && { marketPrice }),
      });
    }

    const content: RiftboundCatalog = {
      sets,
      cards,
      printings,
    };

    c.header("ETag", etag);
    c.header("Last-Modified", new Date(combinedTs).toUTCString());
    c.header("Cache-Control", "public, max-age=60");
    return c.json(content);
  });
