import { publicTierListsContract } from "@openrift/shared/contracts/public-tier-lists";
import type { PublicTierListDetailResponse } from "@openrift/shared/types/api/tier-list";
import { implement } from "@orpc/server";

import { gravatarHashForEmail } from "../../../lib/gravatar.js";
import { requireUser } from "../../../orpc/base.js";
import type { ApiContext } from "../../../orpc/context.js";
import { toPublicTierList } from "../lib/tier-list-presenters.js";

const os = implement(publicTierListsContract).$context<ApiContext>().use(requireUser);

/**
 * An unknown or no-longer-public share token returns NOT_FOUND either way.
 * Cards travel as bare ids, resolved against the client's own catalogue.
 */
export const publicTierListsRouter = {
  share: os.share.handler(
    async ({ input, context, errors }): Promise<PublicTierListDetailResponse> => {
      const found = await context.repos.tierLists.findByShareToken(input.token);
      if (!found) {
        throw errors.NOT_FOUND({ message: "Not found" });
      }

      return {
        tierList: toPublicTierList(found.tierList),
        owner: {
          displayName: found.ownerName ?? "Anonymous",
          gravatarHash: gravatarHashForEmail(found.ownerEmail),
        },
      };
    },
  ),
};
