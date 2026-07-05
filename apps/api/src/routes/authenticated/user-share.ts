import type { UserShareStateResponse } from "@openrift/shared";
import { userShareContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { withUniqueShareToken } from "../../utils/share-token.js";

const os = implement(userShareContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * The signed-in user's bundle-share management (ADR-018). The "user not found"
 * cases are typed NOT_FOUND errors declared on the contract.
 */
export const userShareRouter = {
  get: os.get.handler(async ({ context }): Promise<UserShareStateResponse> => {
    const { userShares } = context.repos;
    const row = await userShares.getShareToken(context.userId);
    return { shareToken: row?.shareToken ?? null, isPublic: Boolean(row?.shareToken) };
  }),

  // Idempotent enable: return the existing token if present, else mint one.
  enable: os.enable.handler(async ({ context, errors }): Promise<UserShareStateResponse> => {
    const { userShares } = context.repos;
    const userId = context.userId;
    const current = await userShares.getShareToken(userId);
    if (current?.shareToken) {
      return { shareToken: current.shareToken, isPublic: true };
    }
    const updated = await withUniqueShareToken((token) => userShares.setShareToken(userId, token));
    if (!updated) {
      throw errors.NOT_FOUND({ message: "User not found" });
    }
    return { shareToken: updated.shareToken, isPublic: true };
  }),

  disable: os.disable.handler(async ({ context, errors }): Promise<void> => {
    const { userShares } = context.repos;
    const updated = await userShares.setShareToken(context.userId, null);
    if (!updated) {
      throw errors.NOT_FOUND({ message: "User not found" });
    }
  }),

  // Overwrites the existing token; the previous URL stops resolving at once.
  rotate: os.rotate.handler(async ({ context, errors }): Promise<UserShareStateResponse> => {
    const { userShares } = context.repos;
    const updated = await withUniqueShareToken((token) =>
      userShares.setShareToken(context.userId, token),
    );
    if (!updated) {
      throw errors.NOT_FOUND({ message: "User not found" });
    }
    return { shareToken: updated.shareToken, isPublic: true };
  }),
};
