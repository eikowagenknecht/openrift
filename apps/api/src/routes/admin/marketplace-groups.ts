import { ERROR_CODES } from "@openrift/shared";
import type { MarketplaceGroupResponse } from "@openrift/shared";
import { adminMarketplaceGroupsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { AppError } from "../../errors.js";
import { requireAuthedUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(adminMarketplaceGroupsContract).$context<ApiContext>().use(requireAuthedUser);

/**
 * Admin marketplace-groups. Not-found is thrown as `AppError` and mapped by the
 * handler's {@link appErrorInterceptor}.
 */
export const adminMarketplaceGroupsRouter = {
  list: os.list.handler(async ({ context }) => {
    const { marketplaceAdmin: mktAdmin } = context.repos;

    const [groups, stagingCounts, assignedCounts] = await Promise.all([
      mktAdmin.listAllGroups(),
      mktAdmin.stagingCountsByMarketplaceGroup(),
      mktAdmin.assignedCountsByMarketplaceGroup(),
    ]);

    const stagingMap = new Map(
      stagingCounts.map((r) => [`${r.marketplace}:${r.groupId}`, r.count]),
    );
    const assignedMap = new Map(
      assignedCounts.map((r) => [`${r.marketplace}:${r.groupId}`, r.count]),
    );

    return {
      groups: groups.map((g): MarketplaceGroupResponse => {
        const key = `${g.marketplace}:${g.groupId}`;
        return {
          marketplace: g.marketplace,
          groupId: g.groupId,
          name: g.name,
          abbreviation: g.abbreviation,
          groupKind: g.groupKind,
          setId: g.setId,
          stagedCount: stagingMap.get(key) ?? 0,
          assignedCount: assignedMap.get(key) ?? 0,
        };
      }),
    };
  }),

  update: os.update.handler(async ({ input, context }): Promise<void> => {
    const { marketplaceAdmin: mktAdmin } = context.repos;
    const { marketplace, id: groupId, ...patch } = input;

    const updated = await mktAdmin.updateGroup(marketplace, groupId, patch);
    if (!updated) {
      throw new AppError(
        404,
        ERROR_CODES.NOT_FOUND,
        `Marketplace group ${marketplace}/${groupId} not found`,
      );
    }
  }),
};
