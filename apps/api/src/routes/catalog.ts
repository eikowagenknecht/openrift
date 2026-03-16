import { centsToDollars } from "@openrift/shared";
import type { Card, CatalogPrinting, RiftboundCatalog } from "@openrift/shared";
import { Hono } from "hono";
import { etag } from "hono/etag";

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

    c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=300");

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
      const printing: CatalogPrinting = {
        ...row,
        images: (imagesByPrinting.get(row.id) ?? []).map((i) => ({ face: i.face, url: i.url })),
      };
      const marketPrice = priceByPrinting.get(row.id);
      if (marketPrice !== undefined) {
        printing.marketPrice = marketPrice;
      }
      printings.push(printing);
    }

    const content: RiftboundCatalog = {
      sets,
      cards,
      printings,
    };

    return c.json(content);
  });
