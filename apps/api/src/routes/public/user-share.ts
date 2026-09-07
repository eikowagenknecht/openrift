import type { PublicListDetailResponse, PublicUserBundleResponse } from "@openrift/shared";
import { publicUserShareContract } from "@openrift/shared/contracts/public-user-share";
import { implement } from "@orpc/server";

import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { expandRuleListCounts } from "../../lib/list-counts.js";
import { parseListRules, toListEntryDetail, toPublicList } from "../../lib/list-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(publicUserShareContract).$context<ApiContext>().use(requireUser);

/** The viewer-dependent `Cache-Control` is set in the mount, not here. */
export const publicUserShareRouter = {
  bundle: os.bundle.handler(
    async ({ input, context, errors }): Promise<PublicUserBundleResponse> => {
      const { userShares, friendGroups, lists: listsRepo } = context.repos;
      const viewerUserId = context.user?.id ?? null;

      const owner = await userShares.findOwnerByShareToken(input.token);
      if (!owner) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }

      const [lists, collections] = await Promise.all([
        userShares.listsForOwner(owner.userId, viewerUserId),
        viewerUserId
          ? friendGroups.collectionsBundleForViewer(owner.userId, viewerUserId)
          : Promise.resolve([]),
      ]);

      // Rule-based lists materialize 0 rows; expand their real counts here.
      const expandedCounts = await expandRuleListCounts(
        listsRepo,
        lists.map(({ list }) => ({
          listId: list.id,
          hasRule: parseListRules(list.rules).length > 0,
        })),
      );

      return {
        owner: {
          displayName: owner.displayName ?? "Anonymous",
          gravatarHash: gravatarHashForEmail(owner.email),
        },
        lists: lists.map(({ list, entryCount, viaGroups }) => ({
          id: list.id,
          name: list.name,
          intent: list.intent,
          kind: list.kind,
          entryCount: expandedCounts.get(list.id) ?? entryCount,
          isPublic: list.shareToken !== null,
          viaGroups,
          createdAt: list.createdAt.toISOString(),
          updatedAt: list.updatedAt.toISOString(),
          hasRule: parseListRules(list.rules).length > 0,
        })),
        collections: collections.map((col) => ({
          id: col.collectionId,
          name: col.collectionName,
          description: col.collectionDescription,
          viaGroups: col.viaGroups,
        })),
      };
    },
  ),

  bundleList: os.bundleList.handler(
    async ({ input, context, errors }): Promise<PublicListDetailResponse> => {
      const { userShares, lists } = context.repos;
      const viewerUserId = context.user?.id ?? null;

      const list = await userShares.findListInBundle(input.token, input.listId, viewerUserId);
      if (!list) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }

      const owner = await userShares.findOwnerByShareToken(input.token);
      if (!owner) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }

      const entries = await lists.entriesWithDetailsAnon(list.id, list.kind);

      return {
        list: toPublicList(list),
        entries: entries.map((row) => toListEntryDetail(row)),
        owner: {
          displayName: owner.displayName ?? "Anonymous",
          gravatarHash: gravatarHashForEmail(owner.email),
        },
      };
    },
  ),
};
