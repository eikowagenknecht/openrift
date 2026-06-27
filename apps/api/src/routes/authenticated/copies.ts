import type {
  CopyAddResponse,
  CopyListMembershipsResponse,
  CopyListResponse,
  CopyMutationResponse,
} from "@openrift/shared";
import { copiesContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { buildCopiesCursor, clampCopiesLimit } from "../../repositories/copies.js";
import { toCopy } from "../../utils/mappers.js";

const os = implement(copiesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Authenticated copies contract. The FK-violation 400 on `add` is a typed
 * `errors.BAD_REQUEST()`; a unique-violation retry is a typed `errors.CONFLICT()`.
 * `add`/`move`/`dispose` return the Postgres txid of the write (ADR-027) so the
 * client's optimistic overlay holds until the change arrives back on the
 * Electric stream.
 */
export const copiesRouter = {
  // All copies the viewer can access: their personal collections plus the
  // shared collections of every group they belong to.
  list: os.list.handler(async ({ input, context }): Promise<CopyListResponse> => {
    const { copies } = context.repos;
    const effectiveLimit = clampCopiesLimit(input.limit);

    const rows = await copies.listForAccessibleCollections(
      context.userId,
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
    const userId = context.userId;
    let created;
    try {
      created = await addCopiesService(repos, transact, userId, input.copies);
    } catch (error) {
      // 23503 = foreign_key_violation: a copy references a printingId that does
      // not exist. Report a clean 400 instead of letting the FK throw a 500.
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw errors.BAD_REQUEST({ message: "One or more printings do not exist" });
      }
      // 23505 = unique_violation: a client-supplied copy id already exists
      // (e.g. a retried request whose first attempt did land). Report a clean
      // conflict the client can treat as "already applied".
      if (error instanceof Error && "code" in error && error.code === "23505") {
        throw errors.CONFLICT({ message: "One or more copies already exist" });
      }
      throw error;
    }
    return { items: created.items, txid: created.txid };
  }),

  // Move copies between collections (reorganization).
  move: os.move.handler(async ({ input, context }): Promise<CopyMutationResponse> => {
    const { moveCopies: moveCopiesService } = context.services;
    const { txid } = await moveCopiesService(
      context.repos,
      context.transact,
      context.userId,
      input.copyIds,
      input.toCollectionId,
    );
    return { txid };
  }),

  // Apply one metadata patch (condition, grading, notes, links) to copies.
  update: os.update.handler(async ({ input, context, errors }): Promise<CopyMutationResponse> => {
    const { updateCopies: updateCopiesService } = context.services;
    try {
      return await updateCopiesService(
        context.transact,
        context.userId,
        input.copyIds,
        input.patch,
      );
    } catch (error) {
      // 23503 = foreign_key_violation (unknown condition/grader slug);
      // 23514 = check_violation (grader/grade pairing). Both are bad input.
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "23503" || error.code === "23514")
      ) {
        throw errors.BAD_REQUEST({ message: "Unknown condition or grader" });
      }
      throw error;
    }
  }),

  // Dispose copies (disposal) — hard-deletes with metadata snapshot.
  dispose: os.dispose.handler(async ({ input, context }): Promise<CopyMutationResponse> => {
    const { disposeCopies: disposeCopiesService } = context.services;
    const { txid } = await disposeCopiesService(context.transact, context.userId, input.copyIds);
    return { txid };
  }),

  // Read-only: which of the viewer's own lists reference these copies.
  listMemberships: os.listMemberships.handler(
    async ({ input, context }): Promise<CopyListMembershipsResponse> => {
      const { lists } = context.repos;
      return await lists.listMembershipsForCopies(
        input.copyIds,
        context.userId,
        input.excludeListId,
      );
    },
  ),
};
