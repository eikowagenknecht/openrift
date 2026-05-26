import type { CardType, Finish, Rarity } from "@openrift/shared/types";
import type { Kysely } from "kysely";

import type { Database } from "../db/index.js";
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
}

interface MatchScope {
  groupId: string;
  viewerUserId: string;
  /** Restrict to a single counterparty — used by the member-detail page. */
  counterpartyUserId?: string;
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
  };
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
    ])
    .execute();

  return rows
    .map((row) => ({
      counterpartyUserId: row.counterpartyUserId as string,
      counterpartyName: row.counterpartyName,
      counterpartyImage: row.counterpartyImage,
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
    }))
    .sort((a, b) => {
      const aName = a.counterpartyName ?? "";
      const bName = b.counterpartyName ?? "";
      const byCounterparty = aName.localeCompare(bName);
      return byCounterparty === 0 ? a.cardName.localeCompare(b.cardName) : byCounterparty;
    });
}
