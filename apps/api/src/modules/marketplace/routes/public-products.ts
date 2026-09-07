import type {
  ProductDetailResponse,
  ProductsListResponse,
} from "@openrift/shared/contracts/products";
import { productsContract } from "@openrift/shared/contracts/products";
import { implement } from "@orpc/server";

import { assertFound } from "../../../lib/assertions.js";
import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  buildCardsResponse,
  buildPrintingsResponse,
  loadPrintingDecorations,
} from "../../catalog/lib/printing-presenters.js";
import { toCoverCards, toProductSummary } from "../lib/product-presenters.js";

const os = implement(productsContract).$context<ApiContext>().use(requireUser);

/** No visibility filtering: a product is public the moment it exists. */
export const productsRouter = {
  list: os.list.handler(async ({ context }): Promise<ProductsListResponse> => {
    const products = await context.repos.products.listWithCounts();
    const covers = await context.repos.products.coverCards(products.map((p) => p.id));
    const coversByProduct = Map.groupBy(covers, (row) => row.productId);
    return {
      products: products.map((product) =>
        toProductSummary(product, toCoverCards(coversByProduct.get(product.id))),
      ),
    };
  }),

  get: os.get.handler(async ({ context, input }): Promise<ProductDetailResponse> => {
    const repos = context.repos;
    const product = await repos.products.getBySlugWithCounts(input.slug);
    assertFound(product, "Product not found");
    const [contents, covers] = await Promise.all([
      repos.products.contents(product.id),
      repos.products.coverCards([product.id]),
    ]);

    const printingIds = contents.map((content) => content.printingId);
    const [printingRows, imageRows] = await Promise.all([
      repos.catalog.printingsByIds(printingIds),
      repos.catalog.printingImagesByPrintingIds(printingIds),
    ]);
    const cardIds = [...new Set(printingRows.map((row) => row.cardId))];
    const [cardRows, banRows, errataRows, decorations, sets] = await Promise.all([
      repos.catalog.cardsByIds(cardIds),
      repos.catalog.cardBansByCardIds(cardIds),
      repos.catalog.cardErrataByCardIds(cardIds),
      loadPrintingDecorations(repos, printingIds),
      repos.catalog.sets(),
    ]);

    return {
      product: toProductSummary(product, toCoverCards(covers)),
      contents,
      cards: buildCardsResponse(cardRows, banRows, errataRows),
      printings: buildPrintingsResponse(printingRows, imageRows, decorations),
      sets,
    };
  }),
};
