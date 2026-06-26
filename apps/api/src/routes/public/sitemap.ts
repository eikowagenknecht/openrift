import type { SitemapDataResponse } from "@openrift/shared";
import { sitemapContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(sitemapContract).$context<ApiContext>().use(requireUser);

/**
 * Public sitemap-data read.
 * `GET /api/v1/sitemap-data` — all card and set entries (slug + updatedAt) for
 * sitemap generation.
 */
export const sitemapRouter = {
  get: os.get.handler(async ({ context }): Promise<SitemapDataResponse> => {
    const { catalog } = context.repos;
    const [cards, sets] = await Promise.all([
      catalog.allCardSitemapEntries(),
      catalog.allSetSitemapEntries(),
    ]);
    return { cards, sets };
  }),
};
