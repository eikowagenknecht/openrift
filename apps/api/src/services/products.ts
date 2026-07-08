import { ERROR_CODES } from "@openrift/shared";

import type { Repos, Transact } from "../deps.js";
import { AppError } from "../errors.js";
import type { ProductContentRow, ProductWithCounts } from "../repositories/products.js";
import { assertFound } from "../utils/assertions.js";

/**
 * Resolves the list an admin wants to snapshot into product contents
 * (ADR-015). The list must be the caller's own and printing-kind (card-kind
 * entries have no printing identity; copy-kind lists are trade binders, not
 * kit definitions). Resolved entries include rule-produced ones (ADR-034);
 * duplicates merge by printing with summed quantities.
 *
 * @returns The content rows to persist.
 */
async function resolveListContents(
  repos: Repos,
  userId: string,
  listId: string,
): Promise<ProductContentRow[]> {
  const list = await repos.lists.getByIdForUser(listId, userId);
  assertFound(list, "List not found");
  if (list.kind !== "printing") {
    throw new AppError(
      400,
      ERROR_CODES.BAD_REQUEST,
      "Only printing lists can be snapshotted into a product",
    );
  }

  const entries = await repos.lists.entriesWithDetails(listId, "printing", userId);
  const byPrinting = new Map<string, number>();
  for (const entry of entries) {
    if (entry.kind !== "printing") {
      continue;
    }
    byPrinting.set(entry.printingId, (byPrinting.get(entry.printingId) ?? 0) + entry.quantity);
  }
  if (byPrinting.size === 0) {
    throw new AppError(400, ERROR_CODES.BAD_REQUEST, "List has no printings to snapshot");
  }

  return [...byPrinting].map(([printingId, quantity]) => ({ printingId, quantity }));
}

/**
 * Creates a product and snapshots the given list as its contents in one
 * transaction. The product keeps no reference to the source list.
 *
 * @returns The created product with content counts.
 */
export async function createProductFromList(
  repos: Repos,
  transact: Transact,
  userId: string,
  input: { slug: string; name: string; description?: string | null; listId: string },
): Promise<ProductWithCounts> {
  if (await repos.products.slugTaken(input.slug)) {
    throw new AppError(409, ERROR_CODES.CONFLICT, `Slug "${input.slug}" already in use`);
  }
  const contents = await resolveListContents(repos, userId, input.listId);

  return transact(async (trx) => {
    const product = await trx.products.create({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
    });
    await trx.products.replaceContents(product.id, contents);
    return {
      ...product,
      printingCount: contents.length,
      cardTotal: contents.reduce((sum, row) => sum + row.quantity, 0),
    };
  });
}

/**
 * Wholesale-replaces a product's contents from a fresh list snapshot
 * (ADR-015: the only way contents change). Bumps the product's `updated_at`.
 */
export async function resyncProductContents(
  repos: Repos,
  transact: Transact,
  userId: string,
  productId: string,
  listId: string,
): Promise<void> {
  const product = await repos.products.getById(productId);
  assertFound(product, "Product not found");
  const contents = await resolveListContents(repos, userId, listId);

  await transact(async (trx) => {
    await trx.products.replaceContents(productId, contents);
    await trx.products.touch(productId);
  });
}
