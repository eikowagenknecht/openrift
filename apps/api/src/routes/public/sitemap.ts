import type { SitemapDataResponse } from "@openrift/shared";
import { sitemapContract } from "@openrift/shared/contracts/sitemap";
import { implement } from "@orpc/server";

import { archiveLegendSlug } from "../../lib/meta-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(sitemapContract).$context<ApiContext>().use(requireUser);

/**
 * Public sitemap-data read.
 * `GET /api/v1/sitemap-data` — all card, set, product, and meta-archive
 * entries (slug + updatedAt) for sitemap generation.
 */
export const sitemapRouter = {
  get: os.get.handler(async ({ context }): Promise<SitemapDataResponse> => {
    const { catalog, products, meta } = context.repos;
    const [cards, sets, productEntries, metaEntries] = await Promise.all([
      catalog.allCardSitemapEntries(),
      catalog.allSetSitemapEntries(),
      products.allSitemapEntries(),
      meta.sitemapEntries(),
    ]);
    return {
      cards,
      sets,
      products: productEntries,
      metaEvents: metaEntries.events,
      metaDecks: metaEntries.decks,
      // The route key is composed from the card's champion tag, so it cannot be
      // a column the repo selects.
      metaLegends: metaEntries.legends.map((row) => ({
        slug: archiveLegendSlug(row),
        updatedAt: row.updatedAt.toISOString(),
      })),
      metaPlayers: metaEntries.players,
    };
  }),
};
