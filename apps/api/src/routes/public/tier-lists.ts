import type { PublicTierListDetailResponse } from "@openrift/shared";
import { publicTierListsContract } from "@openrift/shared/contracts/public-tier-lists";
import { implement } from "@orpc/server";

import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { toPublicTierList } from "../../lib/tier-list-presenters.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";

const os = implement(publicTierListsContract).$context<ApiContext>().use(requireUser);

/**
 * Public shared tier-list view. An unknown token — or one whose list is no
 * longer public — returns a typed NOT_FOUND, so revoking a share is
 * indistinguishable from a link that never existed.
 *
 * Cards travel as bare ids: the share page resolves them against the catalogue
 * the client already holds, the same way the shared-collection page does.
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
