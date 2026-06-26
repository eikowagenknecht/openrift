import type { UserShareStateResponse } from "@openrift/shared";
import { userShareContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { requireUserId } from "../../middleware/get-user-id.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { generateShareToken } from "../../utils/share-token.js";

const os = implement(userShareContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the signed-in user's bundle-share management
 * (ADR-018). Logic unchanged from the previous handlers; the "user not found"
 * cases are typed NOT_FOUND errors instead of assertFound's thrown AppError.
 */
export const userShareRouter = {
  get: os.get.handler(async ({ context }): Promise<UserShareStateResponse> => {
    const { userShares } = context.repos;
    const row = await userShares.getShareToken(requireUserId(context.user));
    return { shareToken: row?.shareToken ?? null, isPublic: Boolean(row?.shareToken) };
  }),

  // Idempotent enable: return the existing token if present, else mint one.
  enable: os.enable.handler(async ({ context, errors }): Promise<UserShareStateResponse> => {
    const { userShares } = context.repos;
    const userId = requireUserId(context.user);
    const current = await userShares.getShareToken(userId);
    if (current?.shareToken) {
      return { shareToken: current.shareToken, isPublic: true };
    }
    const updated = await userShares.setShareToken(userId, generateShareToken());
    if (!updated) {
      throw errors.NOT_FOUND({ message: "User not found" });
    }
    return { shareToken: updated.shareToken, isPublic: true };
  }),

  disable: os.disable.handler(async ({ context, errors }): Promise<void> => {
    const { userShares } = context.repos;
    const updated = await userShares.setShareToken(requireUserId(context.user), null);
    if (!updated) {
      throw errors.NOT_FOUND({ message: "User not found" });
    }
  }),

  // Overwrites the existing token; the previous URL stops resolving at once.
  rotate: os.rotate.handler(async ({ context, errors }): Promise<UserShareStateResponse> => {
    const { userShares } = context.repos;
    const updated = await userShares.setShareToken(
      requireUserId(context.user),
      generateShareToken(),
    );
    if (!updated) {
      throw errors.NOT_FOUND({ message: "User not found" });
    }
    return { shareToken: updated.shareToken, isPublic: true };
  }),
};
