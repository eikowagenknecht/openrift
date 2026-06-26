import type { PublicListDetailResponse, PublicUserBundleResponse } from "@openrift/shared";
import { publicUserShareContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { toListEntryDetail, toPublicList } from "../../utils/mappers.js";

const os = implement(publicUserShareContract).$context<ApiContext>().use(requireUser);

/**
 * oRPC implementation of the public user-share bundle reads (ADR-018). Logic
 * unchanged from the previous `@hono/zod-openapi` handlers; the unknown-token /
 * unknown-list 404 is now a typed `errors.NOT_FOUND()`. The viewer-dependent
 * `Cache-Control` is set in the mount (it knows `loadSession`'s result).
 */
export const publicUserShareRouter = {
  bundle: os.bundle.handler(
    async ({ input, context, errors }): Promise<PublicUserBundleResponse> => {
      const { userShares, friendGroups } = context.repos;
      const viewerUserId = context.user?.id ?? null;

      const owner = await userShares.findOwnerByShareToken(input.token);
      if (!owner) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }

      const [lists, collections] = await Promise.all([
        userShares.listsForOwner(owner.userId, viewerUserId),
        // Group-shared collections only appear for authenticated viewers who
        // share at least one friend group with the owner.
        viewerUserId
          ? friendGroups.collectionsBundleForViewer(owner.userId, viewerUserId)
          : Promise.resolve([]),
      ]);

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
          entryCount,
          isPublic: list.shareToken !== null,
          viaGroups,
          createdAt: list.createdAt.toISOString(),
          updatedAt: list.updatedAt.toISOString(),
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
