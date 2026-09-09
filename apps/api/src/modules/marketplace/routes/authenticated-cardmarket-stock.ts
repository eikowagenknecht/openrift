import { cardmarketStockContract } from "@openrift/shared/contracts/cardmarket-stock";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { presentCardmarketStockResolution } from "../lib/cardmarket-stock-presenters.js";
import { resolveCardmarketStock } from "../lib/cardmarket-stock-resolve.js";

const os = implement(cardmarketStockContract).$context<ApiContext>().use(requireAuthedUser);

export const cardmarketStockRouter = {
  resolve: os.resolve.handler(async ({ input, context }) => {
    const productPrintings = await context.repos.cardmarketStock.productPrintings(
      input.rows.map((row) => row.idProduct),
    );
    const resolution = resolveCardmarketStock(input.rows, productPrintings);
    return presentCardmarketStockResolution(resolution, productPrintings);
  }),
};
