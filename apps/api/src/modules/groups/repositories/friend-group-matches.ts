import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ListRuleProviders } from "../../lists/repositories/lists-rules.js";
import { friendGroupBoxWantsRepo } from "./friend-group-matches-box-wants.js";
import { friendGroupTradeSupplyRepo } from "./friend-group-matches-supply.js";
import { friendGroupMatchViewRepo } from "./friend-group-matches-view.js";

/**
 * Friend-group match views, computed at read time, never materialised.
 *
 * Both panels share one shape: intersect wish demand against trade supply
 * within the same group's opted-in shares. Manual entries and rule output are
 * both expanded (`evaluateListRules` + `expandList`) and matched in TypeScript.
 * Demand is netted against quantities already promised to the wanting member
 * by firm live trades ({@link netDemandAgainstPromises}), the demand-side
 * mirror of the supply side's reserved-copy exclusion. Supply drops one more
 * class on top of the reserved copies: those a member's own live offers
 * already commit ({@link copiesClaimedByPendingOffers}), so the view never
 * advertises a card whose copies a request could not claim.
 *
 * **Only `wish` ↔ `trade` shares participate.** `organize` lists never appear
 * here. Deck-derived demand is excluded by construction — only list entries /
 * rule output are read, which decks never populate.
 */
export function friendGroupMatchesRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    ...friendGroupMatchViewRepo(db, providers),
    ...friendGroupTradeSupplyRepo(db, providers),
    ...friendGroupBoxWantsRepo(db, providers),
  };
}
