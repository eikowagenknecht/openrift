import { evaluateListRules, ownedCopyPrintingScope } from "@openrift/shared/list-rule-eval";
import type { OwnedCopyRow } from "@openrift/shared/list-rule-eval";
import { ruleFiltersOnPrice } from "@openrift/shared/types/list-rule";
import type { Kysely } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { ListRuleProviders } from "../../lists/repositories/lists-rules.js";
import {
  buildSupply,
  loadCopyMeta,
  loadManualEntries,
  loadSharedLists,
  loadUsers,
} from "./friend-group-matches-shared.js";

export interface GiverSupplyScope {
  groupId: string;
  giverUserId: string;
  printingId: string;
}

/**
 * Resolves the giver's reservable supply of one printing within a group, using
 * the exact supply-building path as the match view (`buildSupply`): manual
 * `copy` entries and dynamic trade-rule output both participate, reserved copies
 * drop out of the reservable set. `hasAny` stays reservation-agnostic so the
 * accept path can tell a stack merely exhausted by competing reservations
 * (copies still exist, request stays pending) apart from a vanished basis (the
 * giver deleted/unshared the copies, request auto-cancels).
 */
export async function resolveGiverPrintingSupply(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  scope: GiverSupplyScope,
): Promise<{ unreservedCopyIds: string[]; hasAny: boolean }> {
  const allTradeLists = await loadSharedLists(db, scope.groupId, "trade");
  const tradeLists = allTradeLists.filter((list) => list.ownerUserId === scope.giverUserId);
  if (tradeLists.length === 0) {
    return { unreservedCopyIds: [], hasAny: false };
  }

  const hasRules = tradeLists.some((list) => list.rules.length > 0);
  const ruleCatalog = hasRules && providers ? await providers.assembleCatalog() : null;
  const needsPrices =
    providers !== undefined && tradeLists.some((list) => list.rules.some(ruleFiltersOnPrice));
  const priceLookup = needsPrices ? await providers.priceLookup() : undefined;
  // The copy load below is narrowed to the printings these trade lists can
  // consult, unioned across them.
  const giverScope = new Set<string>();
  for (const list of tradeLists) {
    for (const id of ownedCopyPrintingScope(
      list.rules,
      list.kind === "printing" ? "printing" : "card",
      {
        catalog: ruleCatalog?.printings ?? [],
        customTagAssignments: ruleCatalog?.customTagAssignments,
        priceLookup,
      },
    )) {
      giverScope.add(id);
    }
  }
  const evalContext = {
    catalog: ruleCatalog?.printings ?? [],
    ownedCopies:
      hasRules && providers ? await providers.ownedCopies(scope.giverUserId, [...giverScope]) : [],
    customTagAssignments: ruleCatalog?.customTagAssignments,
    // Keep the nicer copies, offer the plainer — same order the owner's list
    // page uses, so surfaced and matched copies never diverge.
    enumOrders: hasRules && providers ? await providers.enumOrders() : undefined,
    priceLookup,
  };

  const manualByList = await loadManualEntries(
    db,
    tradeLists.map((list) => list.listId),
  );
  const ruleByList = new Map<string, ReturnType<typeof evaluateListRules>>();
  // Reservation-agnostic on purpose: the meta lookup classifies each copy by
  // printing and reservation state, and `hasAny` needs the reserved ones too.
  const offeredCopyIds = new Set<string>();
  for (const list of tradeLists) {
    for (const entry of manualByList.get(list.listId) ?? []) {
      if (entry.copyId) {
        offeredCopyIds.add(entry.copyId);
      }
    }
    if (list.rules.length > 0 && providers) {
      const ruleEntries = evaluateListRules(list.rules, "copy", evalContext, list.ruleCombine);
      ruleByList.set(list.listId, ruleEntries);
      for (const entry of ruleEntries) {
        if (entry.copyId) {
          offeredCopyIds.add(entry.copyId);
        }
      }
    }
  }

  const copyMeta = await loadCopyMeta(db, [...offeredCopyIds]);

  // buildSupply drops reserved copies, mirroring the match view exactly so the
  // reservable count equals the displayed availability.
  const unreserved = new Set<string>();
  for (const list of tradeLists) {
    for (const entry of buildSupply(
      list,
      manualByList.get(list.listId) ?? [],
      ruleByList.get(list.listId) ?? [],
      copyMeta,
    )) {
      if (entry.printingId === scope.printingId) {
        unreserved.add(entry.copyId);
      }
    }
  }

  // Altered copies are outside matching entirely (see buildSupply); they
  // don't count as an offered basis either.
  const hasAny = [...offeredCopyIds].some((copyId) => {
    const meta = copyMeta.get(copyId);
    return meta !== undefined && meta.printingId === scope.printingId && !meta.altered;
  });
  return { unreservedCopyIds: [...unreserved], hasAny };
}

interface PrintingSupplyBucket {
  copyIds: Set<string>;
  listNames: Set<string>;
}

interface TradelistHolderPrintingRow {
  printingId: string;
  quantity: number;
  /** The shared lists those copies sit on, alphabetical. */
  listNames: string[];
}

export interface TradelistHolderRow {
  userId: string;
  userName: string | null;
  quantity: number;
  /** The same copies split by printing, most copies first. */
  printings: TradelistHolderPrintingRow[];
}

/**
 * Aggregates the group's shared-tradelist supply of one card per owner. Mirrors
 * `resolveGiverPrintingSupply` (manual + rule entries through `buildSupply`),
 * but spans all owners and keys on the card, deduping copies that appear on
 * several shared lists. Copies stay split by printing so the caller can tell an
 * alt art from the standard print; the owner total is their sum, which is exact
 * because a copy belongs to exactly one printing.
 */
async function resolveTradelistHoldersForCard(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  scope: { groupId: string; cardId: string },
): Promise<TradelistHolderRow[]> {
  const tradeLists = await loadSharedLists(db, scope.groupId, "trade");
  if (tradeLists.length === 0) {
    return [];
  }

  const hasRules = tradeLists.some((list) => list.rules.length > 0);
  const ruleCatalog = hasRules && providers ? await providers.assembleCatalog() : null;
  const enumOrders = hasRules && providers ? await providers.enumOrders() : undefined;
  const needsPrices =
    providers !== undefined && tradeLists.some((list) => list.rules.some(ruleFiltersOnPrice));
  const priceLookup = needsPrices ? await providers.priceLookup() : undefined;
  const ownedCopiesByOwner = new Map<string, OwnedCopyRow[]>();
  if (hasRules && providers) {
    const ruleOwners = new Set(
      tradeLists.filter((list) => list.rules.length > 0).map((list) => list.ownerUserId),
    );
    for (const ownerId of ruleOwners) {
      ownedCopiesByOwner.set(ownerId, await providers.ownedCopies(ownerId));
    }
  }

  const manualByList = await loadManualEntries(
    db,
    tradeLists.map((list) => list.listId),
  );
  const ruleByList = new Map<string, ReturnType<typeof evaluateListRules>>();
  const allCopyIds = new Set<string>();
  for (const list of tradeLists) {
    for (const entry of manualByList.get(list.listId) ?? []) {
      if (entry.copyId) {
        allCopyIds.add(entry.copyId);
      }
    }
    if (list.rules.length > 0 && providers) {
      const ruleEntries = evaluateListRules(
        list.rules,
        "copy",
        {
          catalog: ruleCatalog?.printings ?? [],
          ownedCopies: ownedCopiesByOwner.get(list.ownerUserId) ?? [],
          customTagAssignments: ruleCatalog?.customTagAssignments,
          enumOrders,
          priceLookup,
        },
        list.ruleCombine,
      );
      ruleByList.set(list.listId, ruleEntries);
      for (const entry of ruleEntries) {
        if (entry.copyId) {
          allCopyIds.add(entry.copyId);
        }
      }
    }
  }
  const copyMeta = await loadCopyMeta(db, [...allCopyIds]);

  const printingsByOwner = new Map<string, Map<string, PrintingSupplyBucket>>();
  for (const list of tradeLists) {
    for (const entry of buildSupply(
      list,
      manualByList.get(list.listId) ?? [],
      ruleByList.get(list.listId) ?? [],
      copyMeta,
    )) {
      if (entry.cardId !== scope.cardId) {
        continue;
      }
      let byPrinting = printingsByOwner.get(entry.ownerUserId);
      if (!byPrinting) {
        byPrinting = new Map();
        printingsByOwner.set(entry.ownerUserId, byPrinting);
      }
      let bucket = byPrinting.get(entry.printingId);
      if (!bucket) {
        bucket = { copyIds: new Set(), listNames: new Set() };
        byPrinting.set(entry.printingId, bucket);
      }
      bucket.copyIds.add(entry.copyId);
      bucket.listNames.add(entry.sellListName);
    }
  }

  const users = await loadUsers(db, [...printingsByOwner.keys()]);
  return [...printingsByOwner]
    .map(([userId, byPrinting]) => {
      const printings = [...byPrinting]
        .map(([printingId, bucket]) => ({
          printingId,
          quantity: bucket.copyIds.size,
          listNames: [...bucket.listNames].sort((first, second) => first.localeCompare(second)),
        }))
        .sort(
          (first, second) =>
            second.quantity - first.quantity || first.printingId.localeCompare(second.printingId),
        );
      return {
        userId,
        userName: users.get(userId)?.name ?? null,
        quantity: printings.reduce((total, printing) => total + printing.quantity, 0),
        printings,
      };
    })
    .sort((first, second) => {
      const byQuantity = second.quantity - first.quantity;
      return byQuantity === 0
        ? (first.userName ?? "").localeCompare(second.userName ?? "")
        : byQuantity;
    });
}

export function friendGroupTradeSupplyRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    /**
     * Copies claimed by the giver's own pending offers stay in the result;
     * `setTradeQuantity` must exclude the one offer it is resizing itself.
     */
    giverPrintingSupply(
      scope: GiverSupplyScope,
    ): Promise<{ unreservedCopyIds: string[]; hasAny: boolean }> {
      return resolveGiverPrintingSupply(db, providers, scope);
    },

    /**
     * Unlike the match view, copies claimed by a pending offer still count here.
     * Not viewer-scoped: the group's Discord link is what authorizes this query.
     */
    tradelistHoldersForCard(scope: {
      groupId: string;
      cardId: string;
    }): Promise<TradelistHolderRow[]> {
      return resolveTradelistHoldersForCard(db, providers, scope);
    },
  };
}
