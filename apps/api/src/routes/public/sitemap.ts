import type { SitemapDataResponse } from "@openrift/shared";
import { sitemapContract } from "@openrift/shared/contracts/sitemap";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(sitemapContract).$context<ApiContext>().use(requireUser);

/**
 * Public sitemap-data read.
 * `GET /api/v1/sitemap-data` — all card, set, and product entries (slug +
 * updatedAt) for sitemap generation.
 */
export const sitemapRouter = {
  get: os.get.handler(async ({ context }): Promise<SitemapDataResponse> => {
    const { catalog, products } = context.repos;
    const [cards, sets, productEntries] = await Promise.all([
      catalog.allCardSitemapEntries(),
      catalog.allSetSitemapEntries(),
      products.allSitemapEntries(),
    ]);
    return { cards, sets, products: productEntries };
  }),
};
