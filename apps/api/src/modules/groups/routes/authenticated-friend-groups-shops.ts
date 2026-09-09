import { friendGroupsContract } from "@openrift/shared/contracts/friend-groups";
import { ERROR_CODES } from "@openrift/shared/error-codes";
import type {
  FriendGroupShopEventsResponse,
  FriendGroupShopSearchResponse,
  FriendGroupShopsResponse,
} from "@openrift/shared/types/api/friend-group";
import { implement } from "@orpc/server";

import { AppError } from "../../../errors.js";
import { requireAuthedUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import {
  presentGroupShop,
  presentShopEvent,
  presentShopSearchResult,
} from "../lib/friend-group-shop-presenters.js";
import { loadGroupForMember, requireRole } from "../lib/group-access.js";

const MAX_SHOPS_PER_GROUP = 10;

const SHOP_EVENT_HORIZON_DAYS = 14;

const os = implement(friendGroupsContract).$context<ApiContext>().use(requireAuthedUser);

export const friendGroupsShopsRouter = {
  listShops: os.listShops.handler(async ({ input, context }): Promise<FriendGroupShopsResponse> => {
    const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);

    const shops = await context.repos.friendGroupShops.listShops(ctx.group.id);
    return { items: shops.map((shop) => presentGroupShop(shop)), limit: MAX_SHOPS_PER_GROUP };
  }),

  searchShops: os.searchShops.handler(
    async ({ input, context }): Promise<FriendGroupShopSearchResponse> => {
      const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);
      requireRole(ctx.membership, "admin");

      const [results, linked] = await Promise.all([
        context.repos.friendGroupShops.searchShops(input.q),
        context.repos.friendGroupShops.listShops(ctx.group.id),
      ]);
      const linkedIds = new Set(linked.map((shop) => shop.storeId));
      return { items: results.map((shop) => presentShopSearchResult(shop, linkedIds)) };
    },
  ),

  linkShop: os.linkShop.handler(async ({ input, context }): Promise<void> => {
    const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");

    const exists = await context.repos.friendGroupShops.storeExists(input.storeId);
    if (!exists) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Shop not found");
    }
    const count = await context.repos.friendGroupShops.countShops(ctx.group.id);
    if (count >= MAX_SHOPS_PER_GROUP) {
      throw new AppError(
        409,
        ERROR_CODES.CONFLICT,
        `A group can follow at most ${MAX_SHOPS_PER_GROUP} shops`,
      );
    }
    await context.repos.friendGroupShops.linkShop({
      groupId: ctx.group.id,
      storeId: input.storeId,
      addedByUserId: context.userId,
    });
  }),

  unlinkShop: os.unlinkShop.handler(async ({ input, context }): Promise<void> => {
    const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);
    requireRole(ctx.membership, "admin");

    const deleted = await context.repos.friendGroupShops.unlinkShop(ctx.group.id, input.storeId);
    if (!deleted) {
      throw new AppError(404, ERROR_CODES.NOT_FOUND, "Shop not found");
    }
  }),

  shopEvents: os.shopEvents.handler(
    async ({ input, context }): Promise<FriendGroupShopEventsResponse> => {
      const ctx = await loadGroupForMember(context.repos, input.slug, context.userId);

      const [events, shops] = await Promise.all([
        context.repos.friendGroupShops.listUpcomingEvents(ctx.group.id, SHOP_EVENT_HORIZON_DAYS),
        context.repos.friendGroupShops.listShops(ctx.group.id),
      ]);
      return {
        items: events.map((event) => presentShopEvent(event)),
        shops: shops.map((shop) => ({ storeId: shop.storeId, name: shop.name })),
        horizonDays: SHOP_EVENT_HORIZON_DAYS,
      };
    },
  ),
};
