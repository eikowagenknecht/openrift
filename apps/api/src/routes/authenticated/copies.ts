import type {
  CopyAddResponse,
  CopyListMembershipsResponse,
  CopyListResponse,
} from "@openrift/shared";
import { copiesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUserId } from "../../middleware/get-user-id.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildCopiesCursor, clampCopiesLimit } from "../../repositories/copies.js";
import { toCopy } from "../../utils/mappers.js";

const os = implement(copiesContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the authenticated copies contract. Logic unchanged
 * from the previous handlers; the FK-violation 400 on `add` is now a typed
 * `errors.BAD_REQUEST()` rather than a thrown AppError. `move`/`dispose` return
 * 204 (no body) via the contract's `successStatus`.
 */
export const copiesRouter = {
  // All copies the viewer can access: their personal collections plus the
  // shared collections of every group they belong to.
  list: os.list.handler(async ({ input, context }): Promise<CopyListResponse> => {
    const { copies } = context.repos;
    const effectiveLimit = clampCopiesLimit(input.limit);

    const rows = await copies.listForAccessibleCollections(
      requireUserId(context.user),
      effectiveLimit,
      input.cursor,
    );
    const hasMore = rows.length > effectiveLimit;
    const items = rows.slice(0, effectiveLimit);
    const lastItem = items.at(-1);
    return {
      items: items.map((row) => toCopy(row)),
      nextCursor: hasMore && lastItem ? buildCopiesCursor(lastItem.createdAt, lastItem.id) : null,
    };
  }),

  // Batch add copies (acquisition).
  add: os.add.handler(async ({ input, context, errors }): Promise<CopyAddResponse> => {
    const { addCopies: addCopiesService } = context.services;
    const repos = context.repos;
    const transact = context.transact;
    const userId = requireUserId(context.user);
    let created;
    try {
      created = await addCopiesService(repos, transact, userId, input.copies);
    } catch (error) {
      // 23503 = foreign_key_violation: a copy references a printingId that does
      // not exist. Report a clean 400 instead of letting the FK throw a 500.
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw errors.BAD_REQUEST({ message: "One or more printings do not exist" });
      }
      throw error;
    }
    return { items: created };
  }),

  // Move copies between collections (reorganization).
  move: os.move.handler(async ({ input, context }): Promise<void> => {
    const { moveCopies: moveCopiesService } = context.services;
    await moveCopiesService(
      context.repos,
      context.transact,
      requireUserId(context.user),
      input.copyIds,
      input.toCollectionId,
    );
  }),

  // Dispose copies (disposal) — hard-deletes with metadata snapshot.
  dispose: os.dispose.handler(async ({ input, context }): Promise<void> => {
    const { disposeCopies: disposeCopiesService } = context.services;
    await disposeCopiesService(context.transact, requireUserId(context.user), input.copyIds);
  }),

  // Read-only: which of the viewer's own lists reference these copies.
  listMemberships: os.listMemberships.handler(
    async ({ input, context }): Promise<CopyListMembershipsResponse> => {
      const { lists } = context.repos;
      return await lists.listMembershipsForCopies(
        input.copyIds,
        requireUserId(context.user),
        input.excludeListId,
      );
    },
  ),
};
