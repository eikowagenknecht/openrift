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

export const copiesRouter = {
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

  add: os.add.handler(async ({ input, context, errors }): Promise<CopyAddResponse> => {
    const { addCopies: addCopiesService } = context.services;
    const repos = context.repos;
    const transact = context.transact;
    const userId = context.userId;
    let created;
    try {
      created = await addCopiesService(repos, transact, userId, input.copies, {
        batchId: input.batchId,
      });
    } catch (error) {
      // 23503 = foreign_key_violation: printingId does not exist.
      if (error instanceof Error && "code" in error && error.code === "23503") {
        throw errors.BAD_REQUEST({ message: "One or more printings do not exist" });
      }
      throw error;
    }
    return { items: created };
  }),

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

  update: os.update.handler(async ({ input, context, errors }): Promise<void> => {
    const { updateCopies: updateCopiesService } = context.services;
    try {
      await updateCopiesService(context.transact, context.userId, input.copyIds, input.patch);
    } catch (error) {
      // 23503 = unknown condition/grader slug; 23514 = bad grader/grade pairing.
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

  dispose: os.dispose.handler(async ({ input, context }): Promise<void> => {
    const { disposeCopies: disposeCopiesService } = context.services;
    await disposeCopiesService(context.transact, context.userId, input.copyIds);
  }),

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
