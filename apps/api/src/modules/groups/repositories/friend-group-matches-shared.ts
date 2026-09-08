import {
  evaluateListRules,
  expandList,
  ownedCopyPrintingScope,
} from "@openrift/shared/list-rule-eval";
import type { ManualEntryRow, OwnedCopyRow } from "@openrift/shared/list-rule-eval";
import type { ListKind } from "@openrift/shared/types/api/list";
import { resolveEffectiveTradePreference } from "@openrift/shared/types/api/trade-preferences";
import type {
  Currency,
  EffectiveTradePreference,
  TradePreference,
} from "@openrift/shared/types/api/trade-preferences";
import { hydrateListRules, ruleFiltersOnPrice } from "@openrift/shared/types/list-rule";
import type { ListRuleCombine, ListRules } from "@openrift/shared/types/list-rule";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { BoxWantDemand } from "../../../lib/box-want-allocation.js";
import type { ListRuleProviders } from "../../lists/repositories/lists-rules.js";

export interface SharedListRow {
  listId: string;
  listName: string;
  ownerUserId: string;
  kind: ListKind;
  sharedAt: Date;
  defaultPricePref: TradePreference["pricePref"];
  defaultPriceAbsoluteCents: number | null;
  defaultTradeType: TradePreference["tradeType"];
  currency: Currency | null;
  rules: ListRules;
  ruleCombine: ListRuleCombine | null;
}

export interface ManualEntryWithMeta extends ManualEntryRow {
  createdAt: Date;
}

export interface SupplyEntry {
  copyId: string;
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
  printingId: string;
  cardId: string;
  sellEntryId: string | null;
  sellListId: string;
  sellListName: string;
  ownerUserId: string;
  sharedAt: Date;
  createdAt: Date;
  sellPref: EffectiveTradePreference;
}

export interface DemandEntry extends BoxWantDemand {
  buyEntryId: string | null;
  buyListId: string;
  buyListName: string;
  ownerUserId: string;
  sharedAt: Date;
  createdAt: Date | null;
  buyPref: EffectiveTradePreference;
}

function listDefaultPref(list: SharedListRow): TradePreference {
  return {
    pricePref: list.defaultPricePref,
    priceAbsoluteCents: list.defaultPriceAbsoluteCents,
    tradeType: list.defaultTradeType,
  };
}

export async function loadSharedLists(
  db: Kysely<Database>,
  groupId: string,
  intent: "trade" | "wish",
): Promise<SharedListRow[]> {
  const rows = await db
    .selectFrom("friendGroupListShares as s")
    .innerJoin("lists as l", "l.id", "s.listId")
    .select([
      "l.id as listId",
      "l.name as listName",
      "l.userId as ownerUserId",
      "l.kind as kind",
      "s.sharedAt as sharedAt",
      "l.defaultPricePref",
      "l.defaultPriceAbsoluteCents",
      "l.defaultTradeType",
      "l.currency",
      "l.rules",
      "l.ruleCombine",
    ])
    .where("s.groupId", "=", groupId)
    .where("l.intent", "=", intent)
    .execute();
  return rows.map((row) => ({
    listId: row.listId,
    listName: row.listName,
    ownerUserId: row.ownerUserId,
    kind: row.kind,
    sharedAt: row.sharedAt,
    defaultPricePref: row.defaultPricePref as TradePreference["pricePref"],
    defaultPriceAbsoluteCents: row.defaultPriceAbsoluteCents,
    defaultTradeType: row.defaultTradeType as TradePreference["tradeType"],
    currency: row.currency as Currency | null,
    rules: hydrateListRules(row.rules),
    ruleCombine: row.ruleCombine,
  }));
}

/** `sharedAt` carries the list's creation time; no owner-scoped caller reads it. */
export async function loadOwnedLists(
  db: Kysely<Database>,
  ownerUserId: string,
  intent: "trade" | "wish",
): Promise<SharedListRow[]> {
  const rows = await db
    .selectFrom("lists as l")
    .select([
      "l.id as listId",
      "l.name as listName",
      "l.userId as ownerUserId",
      "l.kind as kind",
      "l.createdAt as sharedAt",
      "l.defaultPricePref",
      "l.defaultPriceAbsoluteCents",
      "l.defaultTradeType",
      "l.currency",
      "l.rules",
      "l.ruleCombine",
    ])
    .where("l.userId", "=", ownerUserId)
    .where("l.intent", "=", intent)
    .execute();
  return rows.map((row) => ({
    listId: row.listId,
    listName: row.listName,
    ownerUserId: row.ownerUserId,
    kind: row.kind,
    sharedAt: row.sharedAt,
    defaultPricePref: row.defaultPricePref as TradePreference["pricePref"],
    defaultPriceAbsoluteCents: row.defaultPriceAbsoluteCents,
    defaultTradeType: row.defaultTradeType as TradePreference["tradeType"],
    currency: row.currency as Currency | null,
    rules: hydrateListRules(row.rules),
    ruleCombine: row.ruleCombine,
  }));
}

export async function loadManualEntries(
  db: Kysely<Database>,
  listIds: string[],
): Promise<Map<string, ManualEntryWithMeta[]>> {
  const byList = new Map<string, ManualEntryWithMeta[]>();
  if (listIds.length === 0) {
    return byList;
  }
  const rows = await db
    .selectFrom("listEntries")
    .select([
      "id",
      "listId",
      "kind",
      "cardId",
      "printingId",
      "copyId",
      "quantity",
      "pricePref",
      "priceAbsoluteCents",
      "tradeType",
      "createdAt",
    ])
    .where("listId", "in", listIds)
    .execute();
  for (const row of rows) {
    const entry: ManualEntryWithMeta = {
      id: row.id,
      kind: row.kind,
      cardId: row.cardId,
      printingId: row.printingId,
      copyId: row.copyId,
      quantity: row.quantity,
      tradeOverride: {
        pricePref: row.pricePref as TradePreference["pricePref"],
        priceAbsoluteCents: row.priceAbsoluteCents,
        tradeType: row.tradeType as TradePreference["tradeType"],
      },
      createdAt: row.createdAt,
    };
    const existing = byList.get(row.listId);
    if (existing) {
      existing.push(entry);
    } else {
      byList.set(row.listId, [entry]);
    }
  }
  return byList;
}

/**
 * Per-member quantities already promised by live incoming trades, keyed
 * `${userId}:${printingId}` / `${userId}:${cardId}`. Both pools are fed by the
 * same trade rows — a promised copy is a copy of one printing of one card, so
 * it satisfies a printing-keyed want and a card-keyed want alike, exactly as
 * applying the sync will raise the owned counts that net dynamic wishes.
 */
interface PromisedIncomingPools {
  byPrinting: Map<string, number>;
  byCard: Map<string, number>;
}

function promisedKey(userId: string, id: string): string {
  return `${userId}:${id}`;
}

/**
 * Loads, for each demand owner, the quantities firm live trades already promise
 * to them: `reserved` or `completed` rows whose receiver-side sync is still
 * unapplied (the card is coming, or is in hand but not recorded yet — the same
 * "live" ladder as the card-trades repo's `liveAnnotationsForUser`). Pending
 * rows are deliberately absent: a pending request is a bid, not a promise, and
 * several members may bid on one card.
 *
 * The sync guard applies to `reserved` too, because a side settles while the
 * trade is still reserved and only the second settle completes it. A receiver
 * who has recorded their half owns the copy, so netting a promise on top of it
 * would count the same card twice and hide their other suggestions.
 */
async function loadPromisedIncoming(
  db: Kysely<Database>,
  ownerIds: string[],
): Promise<PromisedIncomingPools> {
  const byPrinting = new Map<string, number>();
  const byCard = new Map<string, number>();
  if (ownerIds.length === 0) {
    return { byPrinting, byCard };
  }
  const rows = await db
    .selectFrom("cardTrades")
    .select((eb) => [
      "receiverUserId",
      "printingId",
      "cardId",
      eb.cast<number>(eb.fn.sum(eb.ref("quantity")), "integer").as("quantity"),
    ])
    .where("receiverUserId", "in", ownerIds)
    .where("status", "in", ["reserved", "completed"])
    .where("receiverSyncAppliedAt", "is", null)
    .groupBy(["receiverUserId", "printingId", "cardId"])
    .execute();
  for (const row of rows) {
    // The `receiverUserId in ownerIds` filter above rules NULL out; the column
    // is nullable only for a party who has deleted their account.
    if (row.receiverUserId === null) {
      continue;
    }
    const printingKey = promisedKey(row.receiverUserId, row.printingId);
    byPrinting.set(printingKey, (byPrinting.get(printingKey) ?? 0) + row.quantity);
    const cardKey = promisedKey(row.receiverUserId, row.cardId);
    byCard.set(cardKey, (byCard.get(cardKey) ?? 0) + row.quantity);
  }
  return { byPrinting, byCard };
}

export interface PendingOfferRow {
  id: string;
  groupId: string;
  quantity: number;
  giverUserId: string;
  printingId: string;
}

/**
 * Loads every still-`pending` **offer** (`initiator = 'giver'`) the given
 * members have out, in any group, oldest first (the order
 * {@link claimCopiesForOffers} allocates in). Requests are excluded on
 * purpose: a receiver-initiated pending row is a bid and claims nothing, so
 * several members may keep asking for one card while the giver decides.
 */
export async function loadPendingOffers(
  db: Kysely<Database>,
  giverUserIds: string[],
): Promise<PendingOfferRow[]> {
  const rows = await db
    .selectFrom("cardTrades")
    .select(["id", "groupId", "quantity", "giverUserId", "printingId"])
    .where("giverUserId", "in", giverUserIds)
    .where("initiator", "=", "giver")
    .where("status", "=", "pending")
    .orderBy("createdAt", "asc")
    .orderBy("id", "asc")
    .execute();
  // The `giverUserId in giverUserIds` filter rules NULL out; the column is
  // nullable only for a party who has deleted their account, and their offers
  // are cancelled at the same moment.
  return rows.filter((row): row is PendingOfferRow => row.giverUserId !== null);
}

export function offerKey(giverUserId: string, printingId: string): string {
  return `${giverUserId}:${printingId}`;
}

/**
 * Nets wish demand against the owner's promised incoming quantities, so a want
 * a firm trade already covers stops advertising — in every group, against every
 * counterparty. Card demand draws on the per-card pool, printing demand on the
 * per-printing pool; entries consume a pool in build order, a fully covered
 * entry drops out, and a partially covered one keeps its residual want (which
 * is genuinely still tradeable).
 */
function netDemandAgainstPromises(
  demand: DemandEntry[],
  pools: PromisedIncomingPools,
): DemandEntry[] {
  const remainingByPrinting = new Map(pools.byPrinting);
  const remainingByCard = new Map(pools.byCard);
  const netted: DemandEntry[] = [];
  for (const entry of demand) {
    const pool = entry.kind === "printing" ? remainingByPrinting : remainingByCard;
    const id = entry.kind === "printing" ? entry.printingId : entry.cardId;
    if (id === null) {
      netted.push(entry);
      continue;
    }
    const key = promisedKey(entry.ownerUserId, id);
    const promised = pool.get(key) ?? 0;
    if (promised <= 0) {
      netted.push(entry);
      continue;
    }
    const taken = Math.min(entry.buyQuantity, promised);
    pool.set(key, promised - taken);
    if (entry.buyQuantity > taken) {
      netted.push({ ...entry, buyQuantity: entry.buyQuantity - taken });
    }
  }
  return netted;
}

export interface CopyMeta {
  printingId: string;
  cardId: string;
  createdAt: Date;
  reserved: boolean;
  loaned: boolean;
  altered: boolean;
  condition: string | null;
  grader: string | null;
  grade: number | null;
  notesPublic: string | null;
}

export async function loadCopyMeta(
  db: Kysely<Database>,
  copyIds: string[],
): Promise<Map<string, CopyMeta>> {
  const meta = new Map<string, CopyMeta>();
  if (copyIds.length === 0) {
    return meta;
  }
  const rows = await db
    .selectFrom("copies as cp")
    .innerJoin("printings as p", "p.id", "cp.printingId")
    .leftJoin("cardTradeCopies as ctc", "ctc.copyId", "cp.id")
    .leftJoin("loanCopies as lc", "lc.copyId", "cp.id")
    .select([
      "cp.id",
      "cp.printingId",
      "p.cardId",
      "cp.createdAt",
      "cp.isAltered",
      "cp.condition",
      "cp.grader",
      "cp.grade",
      "cp.notesPublic",
      sql<boolean>`(ctc.copy_id is not null)`.as("reserved"),
      sql<boolean>`(lc.copy_id is not null)`.as("loaned"),
    ])
    .where("cp.id", "in", copyIds)
    .execute();
  for (const row of rows) {
    meta.set(row.id, {
      printingId: row.printingId,
      cardId: row.cardId,
      createdAt: row.createdAt,
      reserved: row.reserved,
      loaned: row.loaned,
      altered: row.isAltered,
      condition: row.condition,
      grader: row.grader,
      grade: row.grade,
      notesPublic: row.notesPublic,
    });
  }
  return meta;
}

export async function loadUsers(
  db: Kysely<Database>,
  ids: string[],
): Promise<Map<string, { name: string | null; image: string | null; email: string }>> {
  const map = new Map<string, { name: string | null; image: string | null; email: string }>();
  if (ids.length === 0) {
    return map;
  }
  const rows = await db
    .selectFrom("users")
    .select(["id", "name", "image", "email"])
    .where("id", "in", ids)
    .execute();
  for (const row of rows) {
    map.set(row.id, { name: row.name, image: row.image, email: row.email });
  }
  return map;
}

/**
 * Whether a physical copy may take part in matching at all. Copies reserved by
 * a live trade are invisible to matching; copies out on a loan are physically
 * absent, same treatment. Altered copies never match automatically — a wish
 * means the clean card.
 */
export function isMatchableCopy(meta: CopyMeta | undefined): meta is CopyMeta {
  return meta !== undefined && !meta.reserved && !meta.loaned && !meta.altered;
}

export function buildSupply(
  list: SharedListRow,
  manual: ManualEntryWithMeta[],
  ruleEntries: ReturnType<typeof evaluateListRules>,
  copyMeta: Map<string, CopyMeta>,
): SupplyEntry[] {
  const manualById = new Map(manual.map((entry) => [entry.id, entry]));
  const manualRows: ManualEntryRow[] = manual.map((entry) => ({
    id: entry.id,
    kind: "copy",
    copyId: entry.copyId,
    quantity: entry.quantity,
    tradeOverride: entry.tradeOverride,
  }));
  const expanded = expandList("copy", manualRows, ruleEntries);
  const supply: SupplyEntry[] = [];
  for (const entry of expanded) {
    if (entry.copyId === undefined) {
      continue;
    }
    const meta = copyMeta.get(entry.copyId);
    if (!isMatchableCopy(meta)) {
      continue;
    }
    const manualEntry = entry.id === null ? undefined : manualById.get(entry.id);
    supply.push({
      copyId: entry.copyId,
      condition: meta.condition,
      grader: meta.grader,
      grade: meta.grade,
      notesPublic: meta.notesPublic,
      printingId: meta.printingId,
      cardId: meta.cardId,
      sellEntryId: entry.id,
      sellListId: list.listId,
      sellListName: list.listName,
      ownerUserId: list.ownerUserId,
      sharedAt: list.sharedAt,
      createdAt: manualEntry?.createdAt ?? meta.createdAt,
      sellPref: resolveEffectiveTradePreference(
        entry.tradeOverride,
        listDefaultPref(list),
        list.currency,
      ),
    });
  }
  return supply;
}

function buildDemand(
  list: SharedListRow,
  manual: ManualEntryWithMeta[],
  ruleEntries: ReturnType<typeof evaluateListRules>,
): DemandEntry[] {
  const kind: "card" | "printing" = list.kind === "printing" ? "printing" : "card";
  const manualById = new Map(manual.map((entry) => [entry.id, entry]));
  const manualRows: ManualEntryRow[] = manual.map((entry) => ({
    id: entry.id,
    kind,
    cardId: entry.cardId,
    printingId: entry.printingId,
    quantity: entry.quantity,
    tradeOverride: entry.tradeOverride,
  }));
  const expanded = expandList(kind, manualRows, ruleEntries);
  return expanded.map((entry) => {
    const manualEntry = entry.id === null ? undefined : manualById.get(entry.id);
    return {
      kind,
      cardId: entry.cardId ?? null,
      printingId: entry.printingId ?? null,
      buyEntryId: entry.id,
      buyListId: list.listId,
      buyListName: list.listName,
      ownerUserId: list.ownerUserId,
      buyQuantity: entry.quantity,
      sharedAt: list.sharedAt,
      createdAt: manualEntry?.createdAt ?? null,
      buyPref: resolveEffectiveTradePreference(
        entry.tradeOverride,
        listDefaultPref(list),
        list.currency,
      ),
      acceptablePrintingIds: entry.acceptablePrintingIds ?? null,
    };
  });
}

export type RuleEvalContextFor = (ownerUserId: string) => Parameters<typeof evaluateListRules>[2];

/**
 * Loads everything the rule evaluator needs for a set of lists, once, and
 * returns the per-owner context factory over it. Every input is lazy: the
 * catalog is only assembled when some list has rules, keep orders only for
 * trade rules, prices only for price-bounded rules, and a member's copies only
 * for the printings their own rules can consult.
 */
export async function buildRuleEvalContexts(
  providers: ListRuleProviders | undefined,
  lists: readonly SharedListRow[],
): Promise<RuleEvalContextFor> {
  const needsCatalog = lists.some((list) => list.rules.length > 0);
  const ruleCatalog = needsCatalog && providers ? await providers.assembleCatalog() : null;
  const catalog = ruleCatalog?.printings ?? [];
  const customTagAssignments = ruleCatalog?.customTagAssignments;

  // Reference orders for trade-rule keep/offer ranking, fetched once so the
  // matcher picks the exact same copies the owner sees on their list page — a
  // divergent order would offer copies that don't match what got surfaced.
  const needsKeepOrder =
    providers !== undefined &&
    lists.some((list) => list.rules.some((rule) => rule.kind === "trade"));
  const enumOrders = needsKeepOrder ? await providers.enumOrders() : undefined;

  // Loaded before the copy scopes below so scope and evaluation see the same
  // prices.
  const needsPrices =
    providers !== undefined && lists.some((list) => list.rules.some(ruleFiltersOnPrice));
  const priceLookup = needsPrices ? await providers.priceLookup() : undefined;

  const ownedCopiesByOwner = new Map<string, OwnedCopyRow[]>();
  if (providers) {
    // Per owner, the printings their rule-bearing lists can consult.
    const scopeByOwner = new Map<string, Set<string>>();
    for (const list of lists) {
      if (
        !list.rules.some((rule) => rule.kind === "trade" || (rule.kind === "wish" && rule.netOwned))
      ) {
        continue;
      }
      const listKind = list.kind === "printing" ? "printing" : "card";
      const printingScope = scopeByOwner.get(list.ownerUserId) ?? new Set<string>();
      for (const id of ownedCopyPrintingScope(list.rules, listKind, {
        catalog,
        customTagAssignments,
        priceLookup,
      })) {
        printingScope.add(id);
      }
      scopeByOwner.set(list.ownerUserId, printingScope);
    }
    for (const [ownerId, printingScope] of scopeByOwner) {
      ownedCopiesByOwner.set(ownerId, await providers.ownedCopies(ownerId, [...printingScope]));
    }
  }

  // `customTagAssignments` lets rules filter on custom tags (without it
  // `filterCards` reads no tags).
  return (ownerUserId: string) => ({
    catalog,
    ownedCopies: ownedCopiesByOwner.get(ownerUserId) ?? [],
    customTagAssignments,
    enumOrders,
    priceLookup,
  });
}

export async function assembleDemand(
  db: Kysely<Database>,
  providers: ListRuleProviders | undefined,
  lists: readonly SharedListRow[],
  evalContextFor: RuleEvalContextFor,
): Promise<DemandEntry[]> {
  const manualByList = await loadManualEntries(
    db,
    lists.map((list) => list.listId),
  );
  const demand: DemandEntry[] = [];
  for (const list of lists) {
    const ruleEntries =
      list.rules.length > 0 && providers
        ? evaluateListRules(
            list.rules,
            list.kind,
            evalContextFor(list.ownerUserId),
            list.ruleCombine,
          )
        : [];
    demand.push(...buildDemand(list, manualByList.get(list.listId) ?? [], ruleEntries));
  }
  return demand;
}

/**
 * A want a firm live trade already covers must not keep advertising — in any
 * group, against any counterparty. Reserved copies already vanish from the
 * supply side (`buildSupply`); this is the demand-side mirror. Wish entries are
 * only decremented when the receiver applies their sync, so without this the
 * same want re-surfaces everywhere until then.
 */
export async function netDemandAgainstLiveTrades(
  db: Kysely<Database>,
  demand: DemandEntry[],
): Promise<DemandEntry[]> {
  const promised = await loadPromisedIncoming(db, [
    ...new Set(demand.map((entry) => entry.ownerUserId)),
  ]);
  return netDemandAgainstPromises(demand, promised);
}

export function maxDate(dates: (Date | null | undefined)[]): Date {
  let max = new Date(0);
  for (const date of dates) {
    if (date && date.getTime() > max.getTime()) {
      max = date;
    }
  }
  return max;
}
