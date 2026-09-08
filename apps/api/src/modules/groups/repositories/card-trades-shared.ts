import type { CardTradeInitiator, CardTradeStatus } from "@openrift/shared/types/api/card-trade";
import type { ContactMethod } from "@openrift/shared/types/api/contact-method";
import type { Kysely, Selectable } from "kysely";

import type { Database } from "../../../db/tables.js";
import type { CardTradesTable } from "../../../db/tables/trades.js";

export type CardTrade = Selectable<CardTradesTable>;

/**
 * A trade as the DTO query reads it, with the counterparty's revealed contact
 * methods already attached by the repository.
 *
 * Both parties and the group carry a live column and a snapshot: each join is
 * outer, and a deleted account or friend group leaves its id NULL with its
 * display name snapshotted on the trade row, so the trade stays readable to
 * whoever else took part in it.
 */
export interface CardTradeDtoRow {
  id: string;
  groupId: string | null;
  groupSlug: string | null;
  groupLiveName: string | null;
  groupSnapshotName: string | null;
  giverUserId: string | null;
  receiverUserId: string | null;
  initiator: CardTradeInitiator;
  printingId: string;
  cardId: string;
  quantity: number;
  status: CardTradeStatus;
  giverSyncAppliedAt: Date | null;
  receiverSyncAppliedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  completedAt: Date | null;
  closedAt: Date | null;
  expiresAt: Date | null;
  giverName: string | null;
  giverImage: string | null;
  giverEmail: string | null;
  giverSnapshotName: string | null;
  receiverName: string | null;
  receiverImage: string | null;
  receiverEmail: string | null;
  receiverSnapshotName: string | null;
  counterpartyContacts: readonly ContactMethod[];
}

/**
 * A trade whose group and both of whose parties still exist.
 *
 * Each of these ids goes NULL only when the thing it named was deleted (an
 * account or a friend group), and both deletion triggers cancel every live
 * trade involved before snapshotting, so a trade missing any of the three is
 * always terminal. Every mutation therefore works on this shape;
 * `loadTradeForParty` in the service is where the narrowing is checked.
 */
export interface LiveCardTrade extends CardTrade {
  groupId: string;
  giverUserId: string;
  receiverUserId: string;
}

/**
 * Base DTO query: trade + group slug + both parties' user columns. The
 * counterparty's revealed contact methods are loaded separately (per group) by
 * {@link loadCounterpartyContacts} and attached by
 * {@link withCounterpartyContacts}.
 *
 * Every join is outer, for the same reason each time: a deleted account or
 * friend group leaves its id NULL and its display name snapshotted on the
 * trade row, and the trade stays visible to whoever else took part in it. Both
 * the live and the snapshotted name come back for each, so `toCardTradeResponse`
 * can prefer the live one.
 */
export function tradeDtoBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("cardTrades as t")
    .leftJoin("friendGroups as g", "g.id", "t.groupId")
    .leftJoin("users as giverUser", "giverUser.id", "t.giverUserId")
    .leftJoin("users as receiverUser", "receiverUser.id", "t.receiverUserId")
    .select([
      "t.id",
      "t.groupId",
      "g.slug as groupSlug",
      "g.name as groupLiveName",
      "t.groupName as groupSnapshotName",
      "t.giverUserId",
      "t.receiverUserId",
      "t.initiator",
      "t.printingId",
      "t.cardId",
      "t.quantity",
      "t.status",
      "t.lastActorUserId",
      "t.giverSyncAppliedAt",
      "t.receiverSyncAppliedAt",
      "t.createdAt",
      "t.updatedAt",
      "t.acceptedAt",
      "t.completedAt",
      "t.closedAt",
      "t.expiresAt",
      "giverUser.name as giverName",
      "giverUser.image as giverImage",
      "giverUser.email as giverEmail",
      "t.giverName as giverSnapshotName",
      "receiverUser.name as receiverName",
      "receiverUser.image as receiverImage",
      "receiverUser.email as receiverEmail",
      "t.receiverName as receiverSnapshotName",
    ]);
}

type TradeJoinedRow = Awaited<ReturnType<ReturnType<typeof tradeDtoBaseQuery>["execute"]>>[number];

function contactsKey(groupId: string, userId: string): string {
  return `${groupId}:${userId}`;
}

function counterpartyIdOf(row: TradeJoinedRow, userId: string): string | null {
  return row.giverUserId === userId ? row.receiverUserId : row.giverUserId;
}

/**
 * Loads, for each trade's counterparty, the contact methods they reveal to
 * that group, in one query for all the rows. The viewer's own contacts are
 * never needed. Rows missing either half of the key are skipped: a deleted
 * counterparty has no contacts left to reveal, and contacts are revealed *per
 * group*, so a trade whose group is gone has no scope to look them up in.
 * Both cases are terminal trades, with no action left to coordinate.
 */
async function loadCounterpartyContacts(
  db: Kysely<Database>,
  rows: readonly TradeJoinedRow[],
  userId: string,
): Promise<Map<string, ContactMethod[]>> {
  const pairs: { groupId: string; counterpartyUserId: string }[] = [];
  for (const row of rows) {
    const counterpartyUserId = counterpartyIdOf(row, userId);
    if (counterpartyUserId !== null && row.groupId !== null) {
      pairs.push({ groupId: row.groupId, counterpartyUserId });
    }
  }
  const lookup = new Map<string, ContactMethod[]>();
  if (pairs.length === 0) {
    return lookup;
  }

  const contactRows = await db
    .selectFrom("friendGroupMemberContacts as fgmc")
    .innerJoin("userContactMethods as ucm", "ucm.id", "fgmc.contactMethodId")
    .select([
      "fgmc.groupId as groupId",
      "fgmc.userId as userId",
      "ucm.id as id",
      "ucm.type as type",
      "ucm.value as value",
    ])
    .where((eb) =>
      eb.or(
        pairs.map((pair) =>
          eb.and([
            eb("fgmc.groupId", "=", pair.groupId),
            eb("fgmc.userId", "=", pair.counterpartyUserId),
          ]),
        ),
      ),
    )
    .orderBy("ucm.sortOrder", "asc")
    .orderBy("ucm.id", "asc")
    .execute();

  for (const row of contactRows) {
    const key = contactsKey(row.groupId, row.userId);
    const list = lookup.get(key) ?? [];
    list.push({ id: row.id, type: row.type, value: row.value });
    lookup.set(key, list);
  }
  return lookup;
}

/**
 * Attaches each row's own contacts out of the pooled lookup, so a DTO row
 * carries everything the presenter needs.
 */
export async function withCounterpartyContacts(
  db: Kysely<Database>,
  rows: readonly TradeJoinedRow[],
  userId: string,
): Promise<CardTradeDtoRow[]> {
  const contactsLookup = await loadCounterpartyContacts(db, rows, userId);
  return rows.map((row) => {
    const counterpartyUserId = counterpartyIdOf(row, userId);
    const counterpartyContacts =
      counterpartyUserId === null || row.groupId === null
        ? []
        : (contactsLookup.get(contactsKey(row.groupId, counterpartyUserId)) ?? []);
    return { ...row, counterpartyContacts };
  });
}
