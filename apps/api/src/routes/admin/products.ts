import { adminProductsContract } from "@openrift/shared/contracts/admin/products";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { assertFound } from "../../lib/assertions.js";
import { toCoverCards, toProductSummary } from "../../lib/product-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { createProductFromList, resyncProductContents } from "../../services/products.js";

const os = implement(adminProductsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin product management, gated by the `/api/admin/v1/*` mount. Contents
 * are written only by the list snapshot service; metadata edits are a plain
 * PATCH.
 */
export const adminProductsRouter = {
  create: os.create.handler(async ({ input, context }) => {
    const product = await createProductFromList(
      context.repos,
      context.transact,
      context.userId,
      input,
    );
    const covers = await context.repos.products.coverCards([product.id]);
    return { product: toProductSummary(product, toCoverCards(covers)) };
  }),

  resyncContents: os.resyncContents.handler(async ({ input, context }): Promise<void> => {
    await resyncProductContents(
      context.repos,
      context.transact,
      context.userId,
      input.id,
      input.listId,
    );
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { id, ...patch } = input;
    const { products, sets } = context.repos;
    const existing = await products.getById(id);
    assertFound(existing, "Product not found");
    if (patch.slug !== undefined && (await products.slugTaken(patch.slug, id))) {
      throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${patch.slug}" already in use`);
    }
    if (patch.setId !== null && patch.setId !== undefined) {
      assertFound(await sets.getRef(patch.setId), "Set not found");
    }
    await products.update(id, patch);
  }),

  remove: os.remove.handler(async ({ input, context }): Promise<void> => {
    const removed = await context.repos.products.remove(input.id);
    if (!removed) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Product not found");
    }
  }),
};
