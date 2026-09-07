import { userShareContract } from "@openrift/shared/contracts/user-share";
import type { UserShareStateResponse } from "@openrift/shared/types/api/user-share";
import { implement } from "@orpc/server";

import { withUniqueShareToken } from "../../../lib/share-token.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";

const os = implement(userShareContract).$context<ApiContext>().use(requireAuthedUser);

export const userShareRouter = {
  get: os.get.handler(async ({ context }): Promise<UserShareStateResponse> => {
    const { userShares } = context.repos;
    const row = await userShares.getShareToken(context.userId);
    return { shareToken: row?.shareToken ?? null, isPublic: Boolean(row?.shareToken) };
  }),

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
