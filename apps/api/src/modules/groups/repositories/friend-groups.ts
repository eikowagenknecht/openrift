import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { friendGroupCollectionSharesRepo } from "./friend-groups-collection-shares.js";
import { friendGroupRecordsRepo } from "./friend-groups-core.js";
import { friendGroupInvitesRepo } from "./friend-groups-invites.js";
import { friendGroupListSharesRepo } from "./friend-groups-list-shares.js";
import { friendGroupMembersRepo } from "./friend-groups-members.js";

/**
 * Authorization is the caller's job: routes pull the viewer's role via
 * `getMembership` and gate writes against {@link FriendGroupRole}. The repo
 * itself is naïve.
 */
export function friendGroupsRepo(db: Kysely<Database>) {
  return {
    ...friendGroupRecordsRepo(db),
    ...friendGroupMembersRepo(db),
    ...friendGroupInvitesRepo(db),
    ...friendGroupListSharesRepo(db),
    ...friendGroupCollectionSharesRepo(db),
  };
}
