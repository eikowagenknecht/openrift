import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { allocateBoxWants } from "../../../lib/box-want-allocation.js";
import type {
  BoxAvailablePrinting,
  BoxCollectionAvailability,
  BoxWantRow,
} from "../../../lib/box-want-allocation.js";
import type { ListRuleProviders } from "../../lists/repositories/lists-rules.js";
import {
  assembleDemand,
  buildRuleEvalContexts,
  isMatchableCopy,
  loadCopyMeta,
  loadOwnedLists,
  netDemandAgainstLiveTrades,
} from "./friend-group-matches-shared.js";

/**
 * The takeable contents of every bulk box a group owns, pooled per printing.
 *
 * Group-owned collections are the ones with `group_id` set (and `user_id` null
 * by the ownership check constraint), so no membership filter is needed here —
 * the caller has already established the viewer is a member. Eligibility runs
 * through {@link loadCopyMeta} and {@link isMatchableCopy}, the same pair the
 * match view uses, so a copy that is reserved, out on loan or altered can never
 * count in one place and not the other.
 */
async function loadGroupBoxContents(
  db: Kysely<Database>,
  groupId: string,
): Promise<BoxCollectionAvailability[]> {
  const rows = await db
    .selectFrom("copies as cp")
    .innerJoin("collections as c", "c.id", "cp.collectionId")
    .select(["cp.id as copyId", "c.id as collectionId"])
    .where("c.groupId", "=", groupId)
    .orderBy("c.id")
    .orderBy("cp.id")
    .execute();
  if (rows.length === 0) {
    return [];
  }
  const copyMeta = await loadCopyMeta(
    db,
    rows.map((row) => row.copyId),
  );
  const byCollection = new Map<string, Map<string, BoxAvailablePrinting>>();
  for (const row of rows) {
    const meta = copyMeta.get(row.copyId);
    if (!isMatchableCopy(meta)) {
      continue;
    }
    let printings = byCollection.get(row.collectionId);
    if (!printings) {
      printings = new Map();
      byCollection.set(row.collectionId, printings);
    }
    const slot = printings.get(meta.printingId);
    if (slot) {
      slot.quantity += 1;
    } else {
      printings.set(meta.printingId, {
        printingId: meta.printingId,
        cardId: meta.cardId,
        quantity: 1,
      });
    }
  }
  return [...byCollection].map(([collectionId, printings]) => ({
    collectionId,
    printings: [...printings.values()],
  }));
}

async function resolveBoxWantsForViewer(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  scope: { groupId: string; viewerUserId: string },
): Promise<BoxWantRow[]> {
  const wishLists = await loadOwnedLists(db, scope.viewerUserId, "wish");
  if (wishLists.length === 0) {
    return [];
  }
  const boxes = await loadGroupBoxContents(db, scope.groupId);
  if (boxes.length === 0) {
    return [];
  }
  const evalContextFor = await buildRuleEvalContexts(providers, wishLists);
  const rawDemand = await assembleDemand(db, providers, wishLists, evalContextFor);
  const demand = await netDemandAgainstLiveTrades(db, rawDemand);
  return allocateBoxWants(demand, boxes);
}

export function friendGroupBoxWantsRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    /**
     * What the viewer's wishlists still want out of the group's bulk boxes,
     * with the quantity actually takeable from each box.
     *
     * Same amount semantics as the match view: demand is the viewer's manual
     * plus rule-derived wish entries, netted against firm live trades, and the
     * boxes drop reserved, loaned and altered copies exactly as `buildSupply`
     * does. Only group-owned collections count — a member's personal collection
     * shared into the group is theirs, not the group's to take from.
     *
     * Deliberately *not* share-scoped: a bulk box is take-freely, so every
     * wishlist the viewer owns participates, matching the wishlist heart that
     * already renders on box surfaces. That also means the answer is
     * viewer-private — no other member's lists are read.
     */
    boxWantsForViewer(scope: { groupId: string; viewerUserId: string }): Promise<BoxWantRow[]> {
      return resolveBoxWantsForViewer(db, providers, scope);
    },
  };
}
