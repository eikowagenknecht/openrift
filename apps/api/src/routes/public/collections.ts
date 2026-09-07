import type { PublicCollectionDetailResponse } from "@openrift/shared";
import { publicCollectionsContract } from "@openrift/shared/contracts/public-collections";
import { implement } from "@orpc/server";

import { toPublicCollection } from "../../lib/collection-presenters.js";
import { toPublicCopy } from "../../lib/copy-presenters.js";
import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { getFavoriteMarketplace } from "../../lib/preferences.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { clampCopiesLimit } from "../../repositories/copies.js";
import { keysetPage } from "../../repositories/query-helpers.js";

const os = implement(publicCollectionsContract).$context<ApiContext>().use(requireUser);

export const publicCollectionsRouter = {
  share: os.share.handler(
    async ({ input, context, errors }): Promise<PublicCollectionDetailResponse> => {
      const repos = context.repos;
      const { collections, copies, marketplace } = repos;

      const found = await collections.findByShareToken(input.token);
      if (!found) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }

      const favMarketplace = await getFavoriteMarketplace(repos, found.collection.userId);
      const value = await marketplace.singleCollectionValue(found.collection.id, favMarketplace);

      const effectiveLimit = clampCopiesLimit(input.limit);
      const rows = await copies.listForCollection(
        found.collection.id,
        effectiveLimit,
        input.cursor,
      );
      const { items, nextCursor } = keysetPage(rows, effectiveLimit, toPublicCopy);

      return {
        collection: toPublicCollection(found.collection, value),
        items,
        nextCursor,
        owner: {
          displayName: found.ownerName ?? "Anonymous",
          // null for group-owned collections (a group has no email/gravatar).
          gravatarHash: found.ownerEmail ? gravatarHashForEmail(found.ownerEmail) : null,
        },
      };
    },
  ),
};
