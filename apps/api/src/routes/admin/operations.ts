import { adminOperationsContract } from "@openrift/shared/contracts";
import { createLogger } from "@openrift/shared/logger";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import {
  refreshCardmarketPrices,
  refreshCardtraderPrices,
  refreshTcgplayerPrices,
} from "../../services/price-refresh/index.js";
import { runJobAsync } from "../../services/run-job.js";

const log = createLogger("admin");

const os = implement(adminOperationsContract).$context<ApiContext>().use(requireUser);

/**
 * Admin operations. The refresh actions return a run handle (202) immediately
 * so Cloudflare doesn't 502 on long operations — callers poll job-runs. Any
 * thrown `AppError` is mapped by the handler's {@link appErrorInterceptor}.
 */
export const adminOperationsRouter = {
  clearPrices: os.clearPrices.handler(async ({ input, context }) => {
    const { marketplaceAdmin: mktAdmin } = context.repos;
    const { prices, variants, products } = await mktAdmin.clearPriceData(input.marketplace);
    return { marketplace: input.marketplace, deleted: { prices, variants, products } };
  }),

  refreshTcgplayer: os.refreshTcgplayer.handler(async ({ context }) => {
    const repos = context.repos;
    const fetchFn = context.io.fetch;
    return await runJobAsync(
      { repos, log },
      "tcgplayer.refresh",
      "admin",
      () => refreshTcgplayerPrices(fetchFn, repos, log),
      { summarize: (result) => result },
    );
  }),

  refreshCardmarket: os.refreshCardmarket.handler(async ({ context }) => {
    const repos = context.repos;
    const fetchFn = context.io.fetch;
    return await runJobAsync(
      { repos, log },
      "cardmarket.refresh",
      "admin",
      () => refreshCardmarketPrices(fetchFn, repos, log),
      { summarize: (result) => result },
    );
  }),

  refreshCardtrader: os.refreshCardtrader.handler(async ({ context }) => {
    const repos = context.repos;
    const fetchFn = context.io.fetch;
    const ctToken = context.config.cardtraderApiToken;
    return await runJobAsync(
      { repos, log },
      "cardtrader.refresh",
      "admin",
      () => refreshCardtraderPrices(fetchFn, repos, log, ctToken),
      { summarize: (result) => result },
    );
  }),

  refreshMatviews: os.refreshMatviews.handler(async ({ context }): Promise<void> => {
    const { marketplace, catalog } = context.repos;
    await Promise.all([marketplace.refreshLatestPrices(), catalog.refreshCardAggregates()]);
  }),
};
