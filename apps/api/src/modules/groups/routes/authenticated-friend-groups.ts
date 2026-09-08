import { friendGroupsActivityRouter } from "./authenticated-friend-groups-activity.js";
import { friendGroupsCoreRouter } from "./authenticated-friend-groups-core.js";
import { friendGroupsDiscordRouter } from "./authenticated-friend-groups-discord.js";
import { friendGroupsMembersRouter } from "./authenticated-friend-groups-members.js";
import { friendGroupsSharesRouter } from "./authenticated-friend-groups-shares.js";

/**
 * The friend-groups contract, mounted at `/api/v1/friend-groups`. Role checks /
 * not-found / conflict / bad-request states are thrown as `AppError` and mapped
 * by the handler's appErrorInterceptor.
 */
export const friendGroupsRouter = {
  ...friendGroupsCoreRouter,
  ...friendGroupsMembersRouter,
  ...friendGroupsSharesRouter,
  ...friendGroupsActivityRouter,
  ...friendGroupsDiscordRouter,
};
