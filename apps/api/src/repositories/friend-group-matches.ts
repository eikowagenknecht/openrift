import {
  evaluateListRules,
  expandList,
  hydrateListRules,
  ownedCopyPrintingScope,
  resolveEffectiveTradePreference,
  ruleFiltersOnPrice,
} from "@openrift/shared";
import type {
  Currency,
  EffectiveTradePreference,
  Finish,
  ListKind,
  ListRuleCombine,
  ListRules,
  ManualEntryRow,
  OwnedCopyRow,
  Rarity,
  TradePreference,
} from "@openrift/shared";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { allocateBoxWants } from "../lib/box-want-allocation.js";
import type {
  BoxAvailablePrinting,
  BoxCollectionAvailability,
  BoxWantDemand,
  BoxWantRow,
} from "../lib/box-want-allocation.js";
import { gravatarHashForEmail } from "../lib/gravatar.js";
import { claimCopiesForOffers } from "../lib/trade-offer-claims.js";
import type { ListRuleProviders } from "./lists.js";
import { printingDetailsByIds } from "./query-helpers.js";

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

interface MatchScope {
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
    othersHaveYourWants(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, providers, scope, "others-have-your-wants");
    },

    othersWantYourHaves(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, providers, scope, "others-want-your-haves");
    },

    /**
     * The giver's offered copies of one printing in a group — the reservable
     * supply used to validate and pin a trade. Counts manual `copy` entries and
     * dynamic trade-rule output alike, reusing the same supply builder as the
     * match view so the two can never disagree (a copy offered only via a rule
     * must not read as "0 available" at trade time).
     *
     * Deliberately offer-agnostic: copies claimed by the giver's own pending
     * offers stay in the result, because every caller nets them itself and
     * `setTradeQuantity` must exclude the very offer it is resizing. The match
     * view runs that pass in {@link copiesClaimedByPendingOffers}.
     */
    giverPrintingSupply(
      scope: GiverSupplyScope,
    ): Promise<{ unreservedCopyIds: string[]; hasAny: boolean }> {
      return resolveGiverPrintingSupply(db, providers, scope);
    },

    /**
     * Every member offering a given card on a tradelist shared with the group
     * — the Discord bot's "who has this?" view. Same supply builder as matching
     * (`buildSupply`), so reserved/loaned/altered copies and rule-derived
     * offers behave exactly like the in-app Trades pages. It stops one step
     * short of the match view: copies claimed by a pending offer still count,
     * because the question is who physically holds the card, and the bot's
     * answer is a pointer to a person rather than something to act on directly.
     * Not viewer-centric: the group's link to a Discord server is the consent
     * that scopes it.
     */
    tradelistHoldersForCard(scope: {
      groupId: string;
      cardId: string;
    }): Promise<TradelistHolderRow[]> {
      return resolveTradelistHoldersForCard(db, providers, scope);
    },

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

type MatchDirection = "others-have-your-wants" | "others-want-your-haves";

interface SharedListRow {
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

interface ManualEntryWithMeta extends ManualEntryRow {
  createdAt: Date;
}

interface SupplyEntry {
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

/**
 * Extends {@link BoxWantDemand} rather than restating its fields, so the bulk-box
 * allocation and the match view can never drift on what a want *is* — a rename
 * on either side stops compiling here.
 */
interface DemandEntry extends BoxWantDemand {
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

async function loadSharedLists(
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

/**
 * The same shape as {@link loadSharedLists}, but keyed on ownership rather than
 * a group share. `sharedAt` carries the list's creation time — it only feeds
 * match-feed timestamps, which no owner-scoped caller reads.
 */
async function loadOwnedLists(
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

async function loadManualEntries(
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

interface PendingOfferRow {
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
async function loadPendingOffers(
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

function offerKey(giverUserId: string, printingId: string): string {
  return `${giverUserId}:${printingId}`;
}

/**
 * The supply copies a member's own live offers already commit, so the match
 * view stops advertising a card whose copies are all spoken for.
 *
 * Nothing is pinned until a recipient accepts, so these copies are not
 * `reserved` and `buildSupply` still surfaces them. Without this pass the card
 * kept showing up as requestable and the request then failed at
 * `assertSupplyAvailable` with "Only 0 copies are still available", which reads
 * as "they don't have it any more" rather than "their copy is promised to
 * someone else". The two sides run the same allocation, so what the view offers
 * is what a request can actually claim.
 *
 * Offers living in another group are resolved against *that* group's supply, as
 * {@link claimCopiesForOffers} requires — a giver who shares different copies
 * with different groups must not be emptied out here. That costs one extra
 * supply read per (printing, other group), and only for printings this group
 * can see at all, so the common case of every offer sitting in the group being
 * viewed adds no reads.
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

interface CopyMeta {
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

async function loadCopyMeta(
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

async function loadUsers(
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
function isMatchableCopy(meta: CopyMeta | undefined): meta is CopyMeta {
  return meta !== undefined && !meta.reserved && !meta.loaned && !meta.altered;
}

function buildSupply(
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

type RuleEvalContextFor = (ownerUserId: string) => Parameters<typeof evaluateListRules>[2];

/**
 * Loads everything the rule evaluator needs for a set of lists, once, and
 * returns the per-owner context factory over it. Every input is lazy: the
 * catalog is only assembled when some list has rules, keep orders only for
 * trade rules, prices only for price-bounded rules, and a member's copies only
 * for the printings their own rules can consult.
 */
async function buildRuleEvalContexts(
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
    // Per owner, the printings any of *their* rule-bearing lists can consult,
    // unioned across that owner's lists so one read still covers them all but
    // stays bounded by the rules instead of pulling the whole collection.
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

async function assembleDemand(
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
async function netDemandAgainstLiveTrades(
  db: Kysely<Database>,
  demand: DemandEntry[],
): Promise<DemandEntry[]> {
  const promised = await loadPromisedIncoming(db, [
    ...new Set(demand.map((entry) => entry.ownerUserId)),
  ]);
  return netDemandAgainstPromises(demand, promised);
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

interface GiverSupplyScope {
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
async function resolveGiverPrintingSupply(
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

  // Altered copies are outside matching entirely (see buildSupply), so they
  // don't count as an offered basis either — a stack that only has altered
  // copies left reads as vanished, not as exhausted by reservations.
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

function maxDate(dates: (Date | null | undefined)[]): Date {
  let max = new Date(0);
  for (const date of dates) {
    if (date && date.getTime() > max.getTime()) {
      max = date;
    }
  }
  return max;
}
