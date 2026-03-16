import { centsToDollars } from "@openrift/shared";
import type { Card, CatalogPrinting, PrintingImage, RiftboundCatalog } from "@openrift/shared";
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
    const combinedTs = Math.max(
      new Date(catalogTs.lastModified).getTime(),
      new Date(pricesTs.lastModified).getTime(),
    );
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

    // Build price lookup
    const priceByPrinting = new Map<string, number>();
    for (const row of priceRows) {
      priceByPrinting.set(row.printingId, centsToDollars(row.marketCents));
    }

    // Build API Card objects from DB CardsTable objects in a single pass.
    // CamelCasePlugin returns keys matching the Card interface, so direct assignment works.
    const cards: Record<string, Card> = {};
    for (const row of cardRows) {
      cards[row.id] = row;
    }

    // Build images lookup
    const imagesByPrinting = new Map<string, PrintingImage[]>();
    for (const row of imageRows) {
      if (!row.url) {
        continue;
      }
      let list = imagesByPrinting.get(row.printingId);
      if (!list) {
        list = [];
        imagesByPrinting.set(row.printingId, list);
      }
      list.push({ face: row.face, url: row.url });
    }

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
        images: imagesByPrinting.get(row.id) ?? [],
        ...(marketPrice !== undefined && { marketPrice }),
      });
    }

    const content: RiftboundCatalog = {
      sets: sets.map((s) => ({ id: s.id, slug: s.slug, name: s.name })),
      cards,
      printings,
    };

    c.header("ETag", etag);
    c.header("Cache-Control", "public, max-age=60");
    return c.json(content);
  });
