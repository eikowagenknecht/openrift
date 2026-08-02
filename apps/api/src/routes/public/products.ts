import type { ProductDetailResponse, ProductsListResponse } from "@openrift/shared/contracts";
import { productsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { assertFound } from "../../lib/assertions.js";
import {
  buildCardsResponse,
  buildPrintingsResponse,
  loadMarkerAndChannelMaps,
} from "../../lib/printing-presenters.js";
import { toCoverCards, toProductSummary } from "../../lib/product-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

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
    const repos = context.repos;
    const product = await repos.products.getBySlugWithCounts(input.slug);
    assertFound(product, "Product not found");
    const [contents, covers] = await Promise.all([
      repos.products.contents(product.id),
      repos.products.coverCards([product.id]),
    ]);

    // Inline the catalog slice behind the contents so the page server-renders
    // from this response alone (same shape as the set detail read).
    const printingIds = contents.map((content) => content.printingId);
    const [printingRows, imageRows] = await Promise.all([
      repos.catalog.printingsByIds(printingIds),
      repos.catalog.printingImagesByPrintingIds(printingIds),
    ]);
    const cardIds = [...new Set(printingRows.map((row) => row.cardId))];
    const [cardRows, banRows, errataRows, markerChannelMaps, sets] = await Promise.all([
      repos.catalog.cardsByIds(cardIds),
      repos.catalog.cardBansByCardIds(cardIds),
      repos.catalog.cardErrataByCardIds(cardIds),
      loadMarkerAndChannelMaps(repos, printingIds),
      repos.catalog.sets(),
    ]);
    const { markerBySlug, channelsByPrinting } = markerChannelMaps;

    return {
      product: toProductSummary(product, toCoverCards(covers)),
      contents,
      cards: buildCardsResponse(cardRows, banRows, errataRows),
      printings: buildPrintingsResponse(printingRows, imageRows, markerBySlug, channelsByPrinting),
      sets,
    };
  }),
};
