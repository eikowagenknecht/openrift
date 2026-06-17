import type {
  CardType,
  Currency,
  EffectiveTradePreference,
  Finish,
  Rarity,
  TradePricePref,
  TradeType,
} from "@openrift/shared/types";
import { resolveEffectiveTradePreference } from "@openrift/shared/types";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../db/index.js";
import { gravatarHashForEmail } from "../lib/gravatar.js";
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
 */
export interface MatchRow {
  counterpartyUserId: string;
  counterpartyName: string | null;
  counterpartyImage: string | null;
  counterpartyGravatarHash: string;
  counterpartyNickname: string | null;

  /** The counterparty's source list (their tradelist in "they have", their wishlist in "they want"). */
  counterpartyListId: string;
  counterpartyListName: string;

  sellEntryId: string;
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

  buyEntryId: string;
  buyListId: string;
  buyEntryKind: "card" | "printing";
  buyQuantity: number;

  /** Counterparty (sell side) preference resolved via entry override ?? list default. */
  sellPref: EffectiveTradePreference;
  /** Viewer (buy side) preference resolved the same way. */
  buyPref: EffectiveTradePreference;
}

interface MatchScope {
  groupId: string;
  viewerUserId: string;
  /** Restrict to a single counterparty — used by the member-detail page. */
  counterpartyUserId?: string;
}

/**
 * A deduped incoming match for the activity feed: someone in the group has a
 * card the viewer wants. `matchedAt` is the *latest* of the timestamps that
 * made the match possible (both lists shared, both entries / the copy created),
 * standing in for the unstored "when did this match appear" moment.
 */
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
 * Match-view queries for ADR-013 friend groups. Computed at read time, never
 * materialised — see the ADR's _Match view_ section.
 *
 * Both panels share one SQL shape: join wish entries against trade entries
 * within the same group's opted-in shares. The only difference is who plays
 * "viewer" and who plays "counterparty" on each side.
 *
 * **Only `wish` ↔ `trade` shares participate.** `organize` lists never appear
 * here, even when shared (see member-detail for that). Deck-derived demand
 * (`is_wanted` decks) is excluded by construction — we only read from
 * `list_entries`, which decks never populate.
 *
 * @returns An object with two match queries bound to the given `db`.
 */
export function friendGroupMatchesRepo(db: Kysely<Database>) {
  return {
    /**
     * Cards the *viewer wants* that other members have offered for sale in
     * this group. Joins viewer's wish entries against other members' trade
     * entries, filtered to lists explicitly shared with the group.
     * @returns Match rows; sorted by counterparty, then card name.
     */
    othersHaveYourWants(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, scope, "others-have-your-wants");
    },

    /**
     * Cards the *viewer has* that other members are looking for in this
     * group. Mirror of `othersHaveYourWants`: viewer is the seller,
     * counterparty is the buyer.
     * @returns Match rows; sorted by counterparty, then card name.
     */
    othersWantYourHaves(scope: MatchScope): Promise<MatchRow[]> {
      return runMatchQuery(db, scope, "others-want-your-haves");
    },

    /**
     * The viewer's *incoming* matches (others have what the viewer wants),
     * deduped to one row per (counterparty, printing) and dated by the latest
     * contributing timestamp. Newest first. Powers the "new match for you"
     * activity-feed entries.
     * @returns Deduped incoming match feed rows, newest match first.
     */
    recentIncomingMatchesForFeed(scope: {
      groupId: string;
      viewerUserId: string;
      limit: number;
      /** ADR-030: only matches whose `matchedAt` is strictly after this moment. */
      sinceTimestamp?: Date;
    }): Promise<IncomingMatchFeedRow[]> {
      return runIncomingMatchFeedQuery(db, scope);
    },
  };
}

/** The `matchedAt` proxy: the latest of the timestamps that made the match possible. */
const matchedAtExpr = sql<Date>`greatest(s_sell.shared_at, s_buy.shared_at, cp.created_at, le_buy.created_at, le_sell.created_at)`;

async function runIncomingMatchFeedQuery(
  db: Kysely<Database>,
  scope: { groupId: string; viewerUserId: string; limit: number; sinceTimestamp?: Date },
): Promise<IncomingMatchFeedRow[]> {
  // Same join skeleton as `others-have-your-wants` (seller = counterparty,
  // buyer = viewer), trimmed to feed columns plus a `matchedAt` proxy.
  let query = db
    .selectFrom("friendGroupListShares as s_sell")
    .innerJoin("lists as l_sell", "l_sell.id", "s_sell.listId")
    .innerJoin("listEntries as le_sell", "le_sell.listId", "l_sell.id")
    .innerJoin("copies as cp", "cp.id", "le_sell.copyId")
    .innerJoin("printings as p", "p.id", "cp.printingId")
    .innerJoin("friendGroupListShares as s_buy", (join) =>
      join.onRef("s_buy.groupId", "=", "s_sell.groupId"),
    )
    .innerJoin("lists as l_buy", (join) =>
      join.onRef("l_buy.id", "=", "s_buy.listId").on("l_buy.intent", "=", "wish"),
    )
    .innerJoin("listEntries as le_buy", "le_buy.listId", "l_buy.id")
    .innerJoin("users as cp_user", "cp_user.id", "s_sell.userId")
    .where("s_sell.groupId", "=", scope.groupId)
    .where("l_sell.intent", "=", "trade")
    .where("le_sell.kind", "=", "copy")
    .where("s_buy.userId", "=", scope.viewerUserId)
    .where("s_sell.userId", "<>", scope.viewerUserId)
    // ADR-019: copies reserved by a live trade are invisible.
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("cardTradeCopies as ctc")
            .select(sql`1`.as("one"))
            .whereRef("ctc.copyId", "=", "cp.id"),
        ),
      ),
    )
    .where((eb) =>
      eb.or([
        eb.and([
          eb("le_buy.kind", "=", "card"),
          eb(eb.ref("le_buy.cardId"), "=", eb.ref("p.cardId")),
        ]),
        eb.and([
          eb("le_buy.kind", "=", "printing"),
          eb(eb.ref("le_buy.printingId"), "=", eb.ref("cp.printingId")),
        ]),
      ]),
    );

  // ADR-030 digest: keep only matches that appeared strictly after the
  // watermark. Each raw row's `matchedAt` is its own `greatest(...)`; a
  // (counterparty, printing) is "new" iff its max surviving row is > the
  // watermark, which is exactly what filtering raw rows then deduping yields.
  if (scope.sinceTimestamp !== undefined) {
    query = query.where(sql<boolean>`${matchedAtExpr} > ${scope.sinceTimestamp}`);
  }

  const rows = await query
    .select((eb) => [
      eb.ref("s_sell.userId").as("counterpartyUserId"),
      eb.ref("cp_user.name").as("counterpartyName"),
      eb.ref("cp_user.image").as("counterpartyImage"),
      eb.ref("cp_user.email").as("counterpartyEmail"),
      eb.ref("cp.printingId").as("printingId"),
      eb.ref("p.cardId").as("cardId"),
      matchedAtExpr.as("matchedAt"),
    ])
    .execute();

  // Dedupe to one row per (counterparty, printing), keeping the latest
  // `matchedAt`. Counts in a friend group are small, so a JS pass is simpler
  // and cheaper than DISTINCT ON here.
  const byKey = new Map<string, IncomingMatchFeedRow>();
  for (const row of rows) {
    const key = `${row.counterpartyUserId as string}:${row.printingId}`;
    const matchedAt = row.matchedAt;
    const existing = byKey.get(key);
    if (existing && existing.matchedAt >= matchedAt) {
      continue;
    }
    byKey.set(key, {
      counterpartyUserId: row.counterpartyUserId as string,
      counterpartyName: row.counterpartyName,
      counterpartyImage: row.counterpartyImage,
      counterpartyGravatarHash: gravatarHashForEmail(row.counterpartyEmail),
      printingId: row.printingId,
      cardId: row.cardId,
      matchedAt,
    });
  }
  return [...byKey.values()]
    .sort((a, b) => b.matchedAt.getTime() - a.matchedAt.getTime())
    .slice(0, scope.limit);
}

type MatchDirection = "others-have-your-wants" | "others-want-your-haves";

async function runMatchQuery(
  db: Kysely<Database>,
  scope: MatchScope,
  direction: MatchDirection,
): Promise<MatchRow[]> {
  // Resolve who's selling and who's buying in this direction. The viewer is
  // always one side, the counterparty is the other. The SQL is identical
  // apart from these two filters.
  const sellerUserId = direction === "others-have-your-wants" ? null : scope.viewerUserId;
  const buyerUserId = direction === "others-have-your-wants" ? scope.viewerUserId : null;

  let query = db
    // Trade side: copies offered into this group.
    .selectFrom("friendGroupListShares as s_sell")
    .innerJoin("lists as l_sell", "l_sell.id", "s_sell.listId")
    .innerJoin("listEntries as le_sell", "le_sell.listId", "l_sell.id")
    .innerJoin("copies as cp", "cp.id", "le_sell.copyId")
    .innerJoin("printings as p", "p.id", "cp.printingId")
    .innerJoin("cards as card", "card.id", "p.cardId")
    .leftJoin("printingImages as pi", (join) =>
      join
        .onRef("pi.printingId", "=", "p.id")
        .on("pi.face", "=", "front")
        .on("pi.isActive", "=", true),
    )
    .leftJoin("imageFiles as imgf", "imgf.id", "pi.imageFileId")
    // Wish side: wish entries shared with the same group.
    .innerJoin("friendGroupListShares as s_buy", (join) =>
      join.onRef("s_buy.groupId", "=", "s_sell.groupId"),
    )
    .innerJoin("lists as l_buy", (join) =>
      join.onRef("l_buy.id", "=", "s_buy.listId").on("l_buy.intent", "=", "wish"),
    )
    .innerJoin("listEntries as le_buy", "le_buy.listId", "l_buy.id")
    // Counterparty profile (for grouping/avatar/nickname).
    .innerJoin("users as cp_user", (join) =>
      join.onRef(
        "cp_user.id",
        "=",
        direction === "others-have-your-wants" ? "s_sell.userId" : "s_buy.userId",
      ),
    )
    .leftJoin("friendGroupMembers as cp_member", (join) =>
      join
        .onRef("cp_member.groupId", "=", "s_sell.groupId")
        .onRef(
          "cp_member.userId",
          "=",
          direction === "others-have-your-wants" ? "s_sell.userId" : "s_buy.userId",
        ),
    )
    .where("s_sell.groupId", "=", scope.groupId)
    .where("l_sell.intent", "=", "trade")
    .where("le_sell.kind", "=", "copy")
    // ADR-019: a copy reserved (or completed-pending-giver-sync) by a live trade
    // is invisible to everyone. The trade side is always `cp` regardless of
    // direction, so this single clause covers both panels.
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom("cardTradeCopies as ctc")
            .select(sql`1`.as("one"))
            .whereRef("ctc.copyId", "=", "cp.id"),
        ),
      ),
    )
    // Match rule: card-kind wishes match any printing of the card; printing-
    // kind wishes match the exact printing.
    .where((eb) =>
      eb.or([
        eb.and([
          eb("le_buy.kind", "=", "card"),
          eb(eb.ref("le_buy.cardId"), "=", eb.ref("p.cardId")),
        ]),
        eb.and([
          eb("le_buy.kind", "=", "printing"),
          eb(eb.ref("le_buy.printingId"), "=", eb.ref("cp.printingId")),
        ]),
      ]),
    );

  // Viewer never matches themselves on either side.
  if (sellerUserId !== null) {
    query = query.where("s_sell.userId", "=", sellerUserId);
    query = query.where("s_buy.userId", "<>", sellerUserId);
  }
  if (buyerUserId !== null) {
    query = query.where("s_buy.userId", "=", buyerUserId);
    query = query.where("s_sell.userId", "<>", buyerUserId);
  }

  if (scope.counterpartyUserId !== undefined) {
    const counterpartyColumn = direction === "others-have-your-wants" ? "s_sell" : "s_buy";
    query = query.where(`${counterpartyColumn}.userId`, "=", scope.counterpartyUserId);
  }

  const rows = await query
    .select((eb) => [
      direction === "others-have-your-wants"
        ? eb.ref("s_sell.userId").as("counterpartyUserId")
        : eb.ref("s_buy.userId").as("counterpartyUserId"),
      eb.ref("cp_user.name").as("counterpartyName"),
      eb.ref("cp_user.image").as("counterpartyImage"),
      eb.ref("cp_user.email").as("counterpartyEmail"),
      eb.ref("cp_member.nickname").as("counterpartyNickname"),

      direction === "others-have-your-wants"
        ? eb.ref("l_sell.id").as("counterpartyListId")
        : eb.ref("l_buy.id").as("counterpartyListId"),
      direction === "others-have-your-wants"
        ? eb.ref("l_sell.name").as("counterpartyListName")
        : eb.ref("l_buy.name").as("counterpartyListName"),

      eb.ref("le_sell.id").as("sellEntryId"),
      eb.ref("le_sell.listId").as("sellListId"),
      eb.ref("le_sell.copyId").as("copyId"),
      eb.ref("cp.printingId").as("printingId"),
      eb.ref("p.cardId").as("cardId"),
      eb.ref("card.name").as("cardName"),
      eb.ref("card.type").as("cardType"),
      eb.ref("p.setId").as("setId"),
      eb.ref("p.rarity").as("rarity"),
      eb.ref("p.finish").as("finish"),
      imageId("imgf").as("imageId"),

      eb.ref("le_buy.id").as("buyEntryId"),
      eb.ref("le_buy.listId").as("buyListId"),
      eb.ref("le_buy.kind").as("buyEntryKind"),
      eb.ref("le_buy.quantity").as("buyQuantity"),

      // Effective trade preferences (entry override ?? list default), one
      // pair per side. The shape constraint is re-applied in the row mapper.
      sql<TradePricePref | null>`coalesce(le_sell.price_pref, l_sell.default_price_pref)`.as(
        "sellPricePref",
      ),
      sql<
        number | null
      >`coalesce(le_sell.price_absolute_cents, l_sell.default_price_absolute_cents)`.as(
        "sellPriceAbsoluteCents",
      ),
      sql<TradeType | null>`coalesce(le_sell.trade_type, l_sell.default_trade_type)`.as(
        "sellTradeType",
      ),
      eb.ref("l_sell.currency").as("sellCurrency"),

      sql<TradePricePref | null>`coalesce(le_buy.price_pref, l_buy.default_price_pref)`.as(
        "buyPricePref",
      ),
      sql<
        number | null
      >`coalesce(le_buy.price_absolute_cents, l_buy.default_price_absolute_cents)`.as(
        "buyPriceAbsoluteCents",
      ),
      sql<TradeType | null>`coalesce(le_buy.trade_type, l_buy.default_trade_type)`.as(
        "buyTradeType",
      ),
      eb.ref("l_buy.currency").as("buyCurrency"),
    ])
    .execute();

  return rows
    .map((row) => ({
      counterpartyUserId: row.counterpartyUserId as string,
      counterpartyName: row.counterpartyName,
      counterpartyImage: row.counterpartyImage,
      counterpartyGravatarHash: gravatarHashForEmail(row.counterpartyEmail),
      counterpartyNickname: row.counterpartyNickname,

      counterpartyListId: row.counterpartyListId as string,
      counterpartyListName: row.counterpartyListName,

      sellEntryId: row.sellEntryId as string,
      sellListId: row.sellListId as string,
      copyId: row.copyId as string,
      printingId: row.printingId,
      cardId: row.cardId,
      cardName: row.cardName,
      cardType: row.cardType as CardType,
      setId: row.setId,
      rarity: row.rarity as Rarity,
      finish: row.finish as Finish,
      imageId: row.imageId,

      buyEntryId: row.buyEntryId as string,
      buyListId: row.buyListId as string,
      buyEntryKind: row.buyEntryKind as "card" | "printing",
      buyQuantity: row.buyQuantity,

      sellPref: resolveEffectiveTradePreference(
        {
          pricePref: row.sellPricePref,
          priceAbsoluteCents: row.sellPriceAbsoluteCents,
          tradeType: row.sellTradeType,
        },
        // Already coalesced server-side; pass an empty default so the helper
        // just normalises shape (e.g. clears priceAbsoluteCents when pricePref
        // is not 'absolute').
        { pricePref: null, priceAbsoluteCents: null, tradeType: null },
        row.sellCurrency as Currency | null,
      ),
      buyPref: resolveEffectiveTradePreference(
        {
          pricePref: row.buyPricePref,
          priceAbsoluteCents: row.buyPriceAbsoluteCents,
          tradeType: row.buyTradeType,
        },
        { pricePref: null, priceAbsoluteCents: null, tradeType: null },
        row.buyCurrency as Currency | null,
      ),
    }))
    .sort((a, b) => {
      const aName = a.counterpartyName ?? "";
      const bName = b.counterpartyName ?? "";
      const byCounterparty = aName.localeCompare(bName);
      return byCounterparty === 0 ? a.cardName.localeCompare(b.cardName) : byCounterparty;
    });
}
