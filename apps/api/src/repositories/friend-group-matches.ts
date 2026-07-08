import {
  evaluateListRules,
  expandList,
  hydrateListRules,
  resolveEffectiveTradePreference,
} from "@openrift/shared";
import type {
  CardType,
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
import { gravatarHashForEmail } from "../lib/gravatar.js";
import type { ListRuleProviders } from "./lists.js";
import { imageId } from "./query-helpers.js";

/**
 * One side of a match — a wish entry intersecting a trade entry. The row always
 * carries the *trade* side's card identity (the physical copy that could
 * change hands) plus enough wish-side info to explain *why* the row matched.
 *
 * The "counterparty" is the *other* user — in `othersHaveYourWants` the
 * counterparty is the seller (they have what you want); in
 * `othersWantYourHaves` the counterparty is the buyer (they want what you
 * have). The shape is identical so the UI can render both panels uniformly.
 *
 * Computed app-side (ADR-034): both manual entries and dynamic-rule output
 * participate. Rule-derived entries have no `list_entries` row, so
 * `sellEntryId` / `buyEntryId` are null for them.
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
  printingId: string;
  cardId: string;
  cardName: string;
  cardType: CardType;
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
 * Match-view queries for ADR-013 friend groups, expanded for ADR-034 dynamic
 * rules. Computed at read time, never materialised.
 *
 * Both panels share one shape: intersect wish demand against trade supply
 * within the same group's opted-in shares. Manual entries and rule output are
 * both expanded (`evaluateListRules` + `expandList`) and matched in TypeScript,
 * preserving every invariant of the old single-join query — group/share
 * visibility, reserved-copy exclusion, trade-pref coalescing, and
 * copy → printing → card resolution.
 *
 * **Only `wish` ↔ `trade` shares participate.** `organize` lists never appear
 * here. Deck-derived demand is excluded by construction — we only read list
 * entries / rule output, which decks never populate.
 *
 * @returns An object with the match queries bound to the given `db`.
 */
export function friendGroupMatchesRepo(db: Kysely<Database>, providers?: ListRuleProviders) {
  return {
    /**
     * Cards the *viewer wants* that other members have offered for sale.
     * @returns Match rows; sorted by counterparty, then card name.
     */
    othersHaveYourWants(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, providers, scope, "others-have-your-wants");
    },

    /**
     * Cards the *viewer has* that other members are looking for.
     * @returns Match rows; sorted by counterparty, then card name.
     */
    othersWantYourHaves(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, providers, scope, "others-want-your-haves");
    },

    /**
     * The giver's offered copies of one printing in a group — the reservable
     * supply used to validate and pin a trade. Counts manual `copy` entries and
     * dynamic trade-rule output alike (ADR-034), reusing the same supply builder
     * as the match view so the two can never disagree (a copy offered only via a
     * rule must not read as "0 available" at trade time).
     * @returns The unreserved reservable copy ids plus whether any copy is offered.
     */
    giverPrintingSupply(
      scope: GiverSupplyScope,
    ): Promise<{ unreservedCopyIds: string[]; hasAny: boolean }> {
      return resolveGiverPrintingSupply(db, providers, scope);
    },

    /**
     * The viewer's *incoming* matches (others have what the viewer wants),
     * deduped to one row per (counterparty, printing) and dated by the latest
     * contributing timestamp. Newest first.
     * @returns Deduped incoming match feed rows, newest match first.
     */
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
      // Dedupe to one row per (counterparty, printing), keeping the latest
      // matchedAt; apply the digest watermark; newest first.
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

/** A trade list shared into a group, with its rules. */
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

interface DemandEntry {
  kind: "card" | "printing";
  cardId: string | null;
  printingId: string | null;
  buyEntryId: string | null;
  buyListId: string;
  buyListName: string;
  ownerUserId: string;
  buyQuantity: number;
  sharedAt: Date;
  createdAt: Date | null;
  buyPref: EffectiveTradePreference;
  /**
   * Card demand produced purely by a rule only accepts printings the rule's
   * filters matched (ADR-034 amendment 3). `null` means any printing of the
   * card satisfies the want (manual entries, printing demand).
   */
  acceptablePrintingIds: ReadonlySet<string> | null;
}

/**
 * Re-hydrate the persisted `rules` jsonb into normalized {@link ListRules} via
 * the shared {@link hydrateListRules}, so a rule saved before a newer filter
 * dimension existed still matches (the backfill mirrors `filterCards`). ADR-034.
 * @returns The parsed, normalized rules (empty array when the column is empty).
 */
function parseRules(value: ListRules | string | null | undefined): ListRules {
  return hydrateListRules(value);
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
    rules: parseRules(row.rules),
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

interface CopyMeta {
  printingId: string;
  cardId: string;
  createdAt: Date;
  reserved: boolean;
  loaned: boolean;
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
 * Expands one trade list's manual + rule entries into supply rows (reserved copies dropped).
 * @returns The offered supply copies for the list.
 */
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
    // ADR-019: copies reserved by a live trade are invisible to matching.
    // ADR-039: copies out on a loan are physically absent, same treatment.
    if (!meta || meta.reserved || meta.loaned) {
      continue;
    }
    const manualEntry = entry.id === null ? undefined : manualById.get(entry.id);
    supply.push({
      copyId: entry.copyId,
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

/**
 * Expands one wish list's manual + rule entries into demand rows.
 * @returns The wish demand entries for the list.
 */
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

interface PrintingDetail {
  cardName: string;
  cardType: CardType;
  setId: string;
  rarity: Rarity;
  finish: Finish;
  imageId: string | null;
}

/**
 * Output detail for matched printings (card name/type, set, rarity, finish, image).
 * @returns A map of printing id to its display detail.
 */
async function loadPrintingDetails(
  db: Kysely<Database>,
  printingIds: string[],
): Promise<Map<string, PrintingDetail>> {
  const map = new Map<string, PrintingDetail>();
  if (printingIds.length === 0) {
    return map;
  }
  const rows = await db
    .selectFrom("printings as p")
    .innerJoin("cards as card", "card.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
    .select([
      "p.id",
      "card.name as cardName",
      "card.type as cardType",
      "p.setId",
      "p.rarity",
      "p.finish",
      imageId("imgf").as("imageId"),
    ])
    .where("p.id", "in", printingIds)
    .execute();
  for (const row of rows) {
    map.set(row.id, {
      cardName: row.cardName,
      cardType: row.cardType,
      setId: row.setId,
      rarity: row.rarity,
      finish: row.finish,
      imageId: row.imageId,
    });
  }
  return map;
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

  // Partition by who plays seller (supply) and buyer (demand) in this direction.
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
  // Counterparty scoping (member-detail page): the counterparty is the seller in
  // "others have", the buyer in "others want".
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

  // Rules on any participating list mean we need the catalog for `filterCards`
  // (and, for trade rules, each owner's copies). Manual-only matching skips it;
  // output card/printing details come from a targeted query either way.
  const needsCatalog =
    scopedSupply.some((list) => list.rules.length > 0) ||
    scopedDemand.some((list) => list.rules.length > 0);
  const ruleCatalog = needsCatalog && providers ? await providers.assembleCatalog() : null;
  const catalog = ruleCatalog?.printings ?? [];
  const customTagAssignments = ruleCatalog?.customTagAssignments;

  // Reference orders for trade-rule keep/offer ranking. Fetched once here so the
  // matcher picks the exact same copies the owner sees on their list page — a
  // divergent order would offer copies that don't match what got surfaced.
  const needsKeepOrder =
    providers !== undefined &&
    [...scopedSupply, ...scopedDemand].some((list) =>
      list.rules.some((rule) => rule.kind === "trade"),
    );
  const enumOrders = needsKeepOrder ? await providers.enumOrders() : undefined;

  // Owner copies, loaded once per distinct owner. Needed for trade-rule supply
  // and for wish rules that net against what's owned ("only what I'm missing").
  const ownedCopiesByOwner = new Map<string, OwnedCopyRow[]>();
  if (providers) {
    const ruleOwners = new Set<string>();
    for (const list of [...scopedSupply, ...scopedDemand]) {
      if (
        list.rules.some((rule) => rule.kind === "trade" || (rule.kind === "wish" && rule.netOwned))
      ) {
        ruleOwners.add(list.ownerUserId);
      }
    }
    for (const ownerId of ruleOwners) {
      ownedCopiesByOwner.set(ownerId, await providers.ownedCopies(ownerId));
    }
  }

  const supplyManual = await loadManualEntries(
    db,
    scopedSupply.map((list) => list.listId),
  );
  const demandManual = await loadManualEntries(
    db,
    scopedDemand.map((list) => list.listId),
  );

  // The evaluation context for a given list owner. `customTagAssignments` lets
  // rules filter on custom tags (without it `filterCards` reads no tags).
  const evalContextFor = (ownerUserId: string) => ({
    catalog,
    ownedCopies: ownedCopiesByOwner.get(ownerUserId) ?? [],
    customTagAssignments,
    enumOrders,
  });

  // Evaluate each ruled supply list's copies exactly once, then reuse the result
  // for both the copy-id batch below and `buildSupply` (a `filterCards` pass over
  // the full catalog is not free, so don't run it twice per list).
  const supplyRuleEntries = new Map<string, ReturnType<typeof evaluateListRules>>();
  for (const list of scopedSupply) {
    if (list.rules.length > 0 && providers) {
      supplyRuleEntries.set(
        list.listId,
        evaluateListRules(list.rules, "copy", evalContextFor(list.ownerUserId), list.ruleCombine),
      );
    }
  }

  // Resolve every supply copy's identity + reservation in one pass.
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

  // Build supply + demand.
  const supply: SupplyEntry[] = [];
  for (const list of scopedSupply) {
    supply.push(
      ...buildSupply(
        list,
        supplyManual.get(list.listId) ?? [],
        supplyRuleEntries.get(list.listId) ?? [],
        copyMeta,
      ),
    );
  }
  const demand: DemandEntry[] = [];
  for (const list of scopedDemand) {
    const ruleEntries =
      list.rules.length > 0 && providers
        ? evaluateListRules(
            list.rules,
            list.kind,
            evalContextFor(list.ownerUserId),
            list.ruleCombine,
          )
        : [];
    demand.push(...buildDemand(list, demandManual.get(list.listId) ?? [], ruleEntries));
  }

  // Index demand for matching: card demand by cardId, printing demand by printingId.
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
  const printingDetails = await loadPrintingDetails(db, [
    ...new Set(supply.map((entry) => entry.printingId)),
  ]);

  const result: (MatchRow & { matchedAt?: Date })[] = [];
  for (const supplyEntry of supply) {
    const matches = [
      ...(demandByCard.get(supplyEntry.cardId) ?? []),
      ...(demandByPrinting.get(supplyEntry.printingId) ?? []),
    ];
    for (const demandEntry of matches) {
      // Never match a user with themselves.
      if (supplyEntry.ownerUserId === demandEntry.ownerUserId) {
        continue;
      }
      // A rule-produced card want only accepts printings its filters matched —
      // a copy of the right card in an excluded printing (overnumbered variant,
      // other language) is not a match (ADR-034 amendment 3).
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
        // Mirror of counterpartyListName: the viewer's own side. Incoming rows
        // come from the viewer's wish list (demand), outgoing from their trade
        // list (supply).
        viewerListName: isOthersHave ? demandEntry.buyListName : supplyEntry.sellListName,
        sellEntryId: supplyEntry.sellEntryId,
        sellListId: supplyEntry.sellListId,
        copyId: supplyEntry.copyId,
        printingId: supplyEntry.printingId,
        cardId: supplyEntry.cardId,
        cardName: detail.cardName,
        cardType: detail.cardType,
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
 * giver deleted/unshared the copies, request auto-cancels — ADR-019).
 * @returns The unreserved reservable copy ids plus whether any copy is offered.
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

  // Rules need the catalog (for `filterCards`) and the giver's own copies (trade
  // rules offer owned copies). Both are lazy — skipped when no list has rules.
  const hasRules = tradeLists.some((list) => list.rules.length > 0);
  const ruleCatalog = hasRules && providers ? await providers.assembleCatalog() : null;
  const evalContext = {
    catalog: ruleCatalog?.printings ?? [],
    ownedCopies: hasRules && providers ? await providers.ownedCopies(scope.giverUserId) : [],
    customTagAssignments: ruleCatalog?.customTagAssignments,
    // Trade lists: keep the nicer copies, offer the plainer — same order the
    // owner's list page uses, so surfaced and matched copies never diverge.
    enumOrders: hasRules && providers ? await providers.enumOrders() : undefined,
  };

  const manualByList = await loadManualEntries(
    db,
    tradeLists.map((list) => list.listId),
  );
  const ruleByList = new Map<string, ReturnType<typeof evaluateListRules>>();
  // Every offered copy id (manual + rule), reservation-agnostic, so the meta
  // lookup can classify each by printing and reservation state.
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

  // Unreserved reservable set: buildSupply drops reserved copies, mirroring the
  // match view exactly so the reservable count equals the displayed availability.
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

  const hasAny = [...offeredCopyIds].some(
    (copyId) => copyMeta.get(copyId)?.printingId === scope.printingId,
  );
  return { unreservedCopyIds: [...unreserved], hasAny };
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
