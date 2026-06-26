import type { PublicListDetailResponse } from "@openrift/shared";
import { publicListsContract } from "@openrift/shared/contracts";
import { implement } from "@orpc/server";

import { gravatarHashForEmail } from "../../lib/gravatar.js";
import { requireUser } from "../../orpc/base.js";
import type { ApiContext } from "../../orpc/context.js";
import { toListEntryDetail, toPublicList } from "../../utils/mappers.js";

const os = implement(publicListsContract).$context<ApiContext>().use(requireUser);

/**
 * Public (share-token) list view. An unknown/non-public token returns a typed
 * `errors.NOT_FOUND()`.
 */
export const publicListsRouter = {
  share: os.share.handler(async ({ input, context, errors }): Promise<PublicListDetailResponse> => {
    const { lists } = context.repos;

    const found = await lists.findByShareToken(input.token);
    if (!found) {
      throw errors.NOT_FOUND({ message: "Not found" });
    }

    const entries = await lists.entriesWithDetailsAnon(found.list.id, found.list.kind);

    return {
      list: toPublicList(found.list),
      entries: entries.map((row) => toListEntryDetail(row)),
      owner: {
        displayName: found.ownerName ?? "Anonymous",
        gravatarHash: gravatarHashForEmail(found.ownerEmail),
      },
    };
  }),
};
