import type {
  CopyAddResponse,
  CopyListMembershipsResponse,
  CopyListResponse,
} from "@openrift/shared";
import { copiesContract } from "@openrift/shared/contracts/copies";
import { implement } from "@orpc/server";

import { toCopy } from "../../lib/copy-presenters.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { clampCopiesLimit } from "../../repositories/copies.js";
import { keysetPage } from "../../repositories/query-helpers.js";

const os = implement(copiesContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Authenticated copies contract. The FK-violation 400 on `add` is a typed
 * `errors.BAD_REQUEST()` declared on the contract. `move`/`dispose` return 204
 * (no body) via the contract's `successStatus`.
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
    return keysetPage(rows, effectiveLimit, toCopy);
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
      context.userId,
      input.copyIds,
      input.toCollectionId,
    );
  }),

  // Apply one metadata patch (condition, grading, notes, links) to copies.
  update: os.update.handler(async ({ input, context, errors }): Promise<void> => {
    const { updateCopies: updateCopiesService } = context.services;
    try {
      await updateCopiesService(context.transact, context.userId, input.copyIds, input.patch);
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
  dispose: os.dispose.handler(async ({ input, context }): Promise<void> => {
    const { disposeCopies: disposeCopiesService } = context.services;
    await disposeCopiesService(context.transact, context.userId, input.copyIds);
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
