import { evaluateListRules } from "@openrift/shared/list-rule-eval";
import type { EffectiveTradePreference } from "@openrift/shared/types/api/trade-preferences";
import type { Finish, Rarity } from "@openrift/shared/types/enums";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import { printingDetailsByIds } from "../../../repositories/query-helpers.js";
import type { ListRuleProviders } from "../../lists/repositories/lists-rules.js";
import { gravatarHashForEmail } from "../../users/lib/gravatar.js";
import { claimCopiesForOffers } from "../lib/trade-offer-claims.js";
import {
  assembleDemand,
  buildRuleEvalContexts,
  buildSupply,
  loadCopyMeta,
  loadManualEntries,
  loadPendingOffers,
  loadSharedLists,
  loadUsers,
  maxDate,
  netDemandAgainstLiveTrades,
  offerKey,
} from "./friend-group-matches-shared.js";
import type { DemandEntry, SupplyEntry } from "./friend-group-matches-shared.js";
import { resolveGiverPrintingSupply } from "./friend-group-matches-supply.js";

/**
 * One side of a match — a wish entry intersecting a trade entry. The row always
 * carries the *trade* side's card identity (the physical copy that could
 * change hands) plus enough wish-side info to explain *why* the row matched.
 *
 * The "counterparty" is the *other* user — the seller in `othersHaveYourWants`,
 * the buyer in `othersWantYourHaves`. The shape is identical so the UI can
 * render both panels uniformly.
 *
 * Rule-derived entries have no `list_entries` row, so `sellEntryId` /
 * `buyEntryId` are null for them.
 */
export interface MatchRow {
  counterpartyUserId: string;
  counterpartyName: string | null;
  counterpartyImage: string | null;
  counterpartyGravatarHash: string;

  counterpartyListId: string;
  counterpartyListName: string;

  /** The viewer's own list that produced this match (their wish list when
   * incoming, their trade list when outgoing). Mirror of counterpartyListName. */
  viewerListName: string;

  sellEntryId: string | null;
  sellListId: string;
  copyId: string;
  /** The offered copy's recorded condition slug; null = unrecorded or graded. */
  condition: string | null;
  /** The offered copy's grader slug; non-null exactly when `grade` is. */
  grader: string | null;
  grade: number | null;
  /** The offered copy's public note, shown to the counterparty. */
  notesPublic: string | null;
  printingId: string;
  cardId: string;
  cardName: string;
  setId: string;
  rarity: Rarity;
  finish: Finish;
  imageId: string | null;

  buyEntryId: string | null;
  buyListId: string;
  buyEntryKind: "card" | "printing";
  buyQuantity: number;

  sellPref: EffectiveTradePreference;
  buyPref: EffectiveTradePreference;
}

export interface MatchScope {
  groupId: string;
  viewerUserId: string;
  /** Restrict to a single counterparty — used by the member-detail page. */
  counterpartyUserId?: string;
}

export interface IncomingMatchFeedRow {
  counterpartyUserId: string;
  counterpartyName: string | null;
  counterpartyImage: string | null;
  counterpartyGravatarHash: string;
  printingId: string;
  cardId: string;
  matchedAt: Date;
}

type MatchDirection = "others-have-your-wants" | "others-want-your-haves";

/**
 * These copies are not `reserved` (nothing is pinned until a recipient
 * accepts), so `buildSupply` still surfaces them without this pass.
 * Offers living in another group are resolved against that group's supply,
 * as {@link claimCopiesForOffers} requires.
 */
async function copiesClaimedByPendingOffers(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  groupId: string,
  supply: readonly SupplyEntry[],
): Promise<Set<string>> {
  const claimed = new Set<string>();
  const giverUserIds = [...new Set(supply.map((entry) => entry.ownerUserId))];
  if (giverUserIds.length === 0) {
    return claimed;
  }
  const offers = await loadPendingOffers(db, giverUserIds);
  if (offers.length === 0) {
    return claimed;
  }
  // This group's own view of the supply, deduped: one copy on two shared lists
  // is two match rows but still one physical card.
  const localByKey = new Map<string, Set<string>>();
  for (const entry of supply) {
    const key = offerKey(entry.ownerUserId, entry.printingId);
    const existing = localByKey.get(key);
    if (existing) {
      existing.add(entry.copyId);
    } else {
      localByKey.set(key, new Set([entry.copyId]));
    }
  }

  for (const [key, keyOffers] of Map.groupBy(offers, (offer) =>
    offerKey(offer.giverUserId, offer.printingId),
  )) {
    const local = localByKey.get(key);
    if (local === undefined) {
      continue;
    }
    const supplyByGroup = new Map<string, readonly string[]>([[groupId, [...local]]]);
    for (const offer of keyOffers) {
      if (supplyByGroup.has(offer.groupId)) {
        continue;
      }
      const { unreservedCopyIds } = await resolveGiverPrintingSupply(db, providers, {
        groupId: offer.groupId,
        giverUserId: offer.giverUserId,
        printingId: offer.printingId,
      });
      supplyByGroup.set(offer.groupId, unreservedCopyIds);
    }
    for (const copyId of claimCopiesForOffers(keyOffers, supplyByGroup).claimed) {
      if (local.has(copyId)) {
        claimed.add(copyId);
      }
    }
  }
  return claimed;
}

async function runMatchQuery(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  scope: MatchScope,
  direction: MatchDirection,
  options: { withMatchedAt?: boolean } = {},
): Promise<(MatchRow & { matchedAt?: Date })[]> {
  const tradeLists = await loadSharedLists(db, scope.groupId, "trade");
  const wishLists = await loadSharedLists(db, scope.groupId, "wish");

  const isOthersHave = direction === "others-have-your-wants";
  const supplyLists = tradeLists.filter((list) =>
    isOthersHave
      ? list.ownerUserId !== scope.viewerUserId
      : list.ownerUserId === scope.viewerUserId,
  );
  const demandLists = wishLists.filter((list) =>
    isOthersHave
      ? list.ownerUserId === scope.viewerUserId
      : list.ownerUserId !== scope.viewerUserId,
  );
  // The counterparty is the seller in "others have", the buyer in "others want".
  const scopedSupply =
    scope.counterpartyUserId !== undefined && isOthersHave
      ? supplyLists.filter((list) => list.ownerUserId === scope.counterpartyUserId)
      : supplyLists;
  const scopedDemand =
    scope.counterpartyUserId !== undefined && !isOthersHave
      ? demandLists.filter((list) => list.ownerUserId === scope.counterpartyUserId)
      : demandLists;

  if (scopedSupply.length === 0 || scopedDemand.length === 0) {
    return [];
  }

  const evalContextFor = await buildRuleEvalContexts(providers, [...scopedSupply, ...scopedDemand]);

  const supplyManual = await loadManualEntries(
    db,
    scopedSupply.map((list) => list.listId),
  );
  const rawDemand = await assembleDemand(db, providers, scopedDemand, evalContextFor);

  // Evaluate each ruled supply list's copies exactly once and reuse the result
  // for both the copy-id batch below and `buildSupply` (a `filterCards` pass
  // over the full catalog is not free).
  const supplyRuleEntries = new Map<string, ReturnType<typeof evaluateListRules>>();
  for (const list of scopedSupply) {
    if (list.rules.length > 0 && providers) {
      supplyRuleEntries.set(
        list.listId,
        evaluateListRules(list.rules, "copy", evalContextFor(list.ownerUserId), list.ruleCombine),
      );
    }
  }

  const allCopyIds = new Set<string>();
  for (const list of scopedSupply) {
    for (const entry of supplyManual.get(list.listId) ?? []) {
      if (entry.copyId) {
        allCopyIds.add(entry.copyId);
      }
    }
    for (const entry of supplyRuleEntries.get(list.listId) ?? []) {
      if (entry.copyId) {
        allCopyIds.add(entry.copyId);
      }
    }
  }
  const copyMeta = await loadCopyMeta(db, [...allCopyIds]);

  const offeredSupply: SupplyEntry[] = [];
  for (const list of scopedSupply) {
    offeredSupply.push(
      ...buildSupply(
        list,
        supplyManual.get(list.listId) ?? [],
        supplyRuleEntries.get(list.listId) ?? [],
        copyMeta,
      ),
    );
  }
  const demand = await netDemandAgainstLiveTrades(db, rawDemand);

  // The supply-side counterpart of the demand netting: a copy one of the
  // owner's own live offers already commits stops advertising, because a
  // request for it would be refused (see `copiesClaimedByPendingOffers`).
  const offerClaimed = await copiesClaimedByPendingOffers(
    db,
    providers,
    scope.groupId,
    offeredSupply,
  );
  const supply = offeredSupply.filter((entry) => !offerClaimed.has(entry.copyId));

  const demandByCard = new Map<string, DemandEntry[]>();
  const demandByPrinting = new Map<string, DemandEntry[]>();
  const pushInto = (map: Map<string, DemandEntry[]>, key: string, entry: DemandEntry) => {
    const existing = map.get(key);
    if (existing) {
      existing.push(entry);
    } else {
      map.set(key, [entry]);
    }
  };
  for (const entry of demand) {
    if (entry.kind === "card" && entry.cardId) {
      pushInto(demandByCard, entry.cardId, entry);
    } else if (entry.kind === "printing" && entry.printingId) {
      pushInto(demandByPrinting, entry.printingId, entry);
    }
  }

  const counterpartyIds = new Set(
    isOthersHave ? supply.map((s) => s.ownerUserId) : demand.map((d) => d.ownerUserId),
  );
  const users = await loadUsers(db, [...counterpartyIds]);
  const printingDetails = await printingDetailsByIds(db, [
    ...new Set(supply.map((entry) => entry.printingId)),
  ]);

  const result: (MatchRow & { matchedAt?: Date })[] = [];
  for (const supplyEntry of supply) {
    const matches = [
      ...(demandByCard.get(supplyEntry.cardId) ?? []),
      ...(demandByPrinting.get(supplyEntry.printingId) ?? []),
    ];
    for (const demandEntry of matches) {
      if (supplyEntry.ownerUserId === demandEntry.ownerUserId) {
        continue;
      }
      // A rule-produced card want only accepts printings its filters matched —
      // a copy of the right card in an excluded printing (overnumbered variant,
      // other language) is not a match.
      if (
        demandEntry.acceptablePrintingIds !== null &&
        !demandEntry.acceptablePrintingIds.has(supplyEntry.printingId)
      ) {
        continue;
      }
      const counterparty = isOthersHave ? supplyEntry : demandEntry;
      const profile = users.get(counterparty.ownerUserId);
      const detail = printingDetails.get(supplyEntry.printingId);
      if (!detail) {
        continue;
      }
      const row: MatchRow & { matchedAt?: Date } = {
        counterpartyUserId: counterparty.ownerUserId,
        counterpartyName: profile?.name ?? null,
        counterpartyImage: profile?.image ?? null,
        counterpartyGravatarHash: gravatarHashForEmail(profile?.email ?? ""),
        counterpartyListId: isOthersHave ? supplyEntry.sellListId : demandEntry.buyListId,
        counterpartyListName: isOthersHave ? supplyEntry.sellListName : demandEntry.buyListName,
        viewerListName: isOthersHave ? demandEntry.buyListName : supplyEntry.sellListName,
        sellEntryId: supplyEntry.sellEntryId,
        sellListId: supplyEntry.sellListId,
        copyId: supplyEntry.copyId,
        condition: supplyEntry.condition,
        grader: supplyEntry.grader,
        grade: supplyEntry.grade,
        notesPublic: supplyEntry.notesPublic,
        printingId: supplyEntry.printingId,
        cardId: supplyEntry.cardId,
        cardName: detail.cardName,
        setId: detail.setId,
        rarity: detail.rarity,
        finish: detail.finish,
        imageId: detail.imageId,
        buyEntryId: demandEntry.buyEntryId,
        buyListId: demandEntry.buyListId,
        buyEntryKind: demandEntry.kind,
        buyQuantity: demandEntry.buyQuantity,
        sellPref: supplyEntry.sellPref,
        buyPref: demandEntry.buyPref,
      };
      if (options.withMatchedAt) {
        row.matchedAt = maxDate([
          supplyEntry.sharedAt,
          demandEntry.sharedAt,
          // For a manual supply entry `supplyEntry.createdAt` is the list-entry
          // time; `meta.createdAt` (the copy's acquisition time) is normally
          // older so it never wins, but include it for symmetry with the
          // rule-only path, where it is the only supply timestamp available.
          maxDate([supplyEntry.createdAt, copyMeta.get(supplyEntry.copyId)?.createdAt]),
          demandEntry.createdAt,
        ]);
      }
      result.push(row);
    }
  }

  return result.sort((first, second) => {
    const byCounterparty = (first.counterpartyName ?? "").localeCompare(
      second.counterpartyName ?? "",
    );
    return byCounterparty === 0 ? first.cardName.localeCompare(second.cardName) : byCounterparty;
  });
}

export function friendGroupMatchViewRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    othersHaveYourWants(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, providers, scope, "others-have-your-wants");
    },

    othersWantYourHaves(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, providers, scope, "others-want-your-haves");
    },

    async recentIncomingMatchesForFeed(scope: {
      groupId: string;
      viewerUserId: string;
      limit: number;
      sinceTimestamp?: Date;
    }): Promise<IncomingMatchFeedRow[]> {
      const matches = await runMatchQuery(
        db,
        providers,
        { groupId: scope.groupId, viewerUserId: scope.viewerUserId },
        "others-have-your-wants",
        { withMatchedAt: true },
      );
      const byKey = new Map<string, IncomingMatchFeedRow>();
      for (const row of matches) {
        const matchedAt = row.matchedAt ?? new Date(0);
        if (scope.sinceTimestamp !== undefined && matchedAt <= scope.sinceTimestamp) {
          continue;
        }
        const key = `${row.counterpartyUserId}:${row.printingId}`;
        const existing = byKey.get(key);
        if (existing && existing.matchedAt >= matchedAt) {
          continue;
        }
        byKey.set(key, {
          counterpartyUserId: row.counterpartyUserId,
          counterpartyName: row.counterpartyName,
          counterpartyImage: row.counterpartyImage,
          counterpartyGravatarHash: row.counterpartyGravatarHash,
          printingId: row.printingId,
          cardId: row.cardId,
          matchedAt,
        });
      }
      return [...byKey.values()]
        .sort((first, second) => second.matchedAt.getTime() - first.matchedAt.getTime())
        .slice(0, scope.limit);
    },
  };
}
