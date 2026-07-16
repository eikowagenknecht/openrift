import type { ProductDetailResponse, ProductsListResponse } from "@openrift/shared/contracts";
import { productsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { assertFound } from "../../utils/assertions.js";
import { toCoverCards, toProductSummary } from "../../utils/product-response.js";

const os = implement(productsContract).$context<ApiContext>().use(requireUser);

/**
 * Public preconstructed-product reads (ADR-015). No visibility filtering:
 * a product is public the moment it exists. The detail payload carries
 * printing ids + quantities; the web client resolves them against the catalog.
 */
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
    const product = await context.repos.products.getBySlugWithCounts(input.slug);
    assertFound(product, "Product not found");
    const [contents, covers] = await Promise.all([
      context.repos.products.contents(product.id),
      context.repos.products.coverCards([product.id]),
    ]);
    return { product: toProductSummary(product, toCoverCards(covers)), contents };
  }),
};
