import type { LoanCounterparty, LoanResponse, LoanRole } from "@openrift/shared/types";
import type { Kysely, Selectable } from "kysely";
import { sql } from "kysely";

import type { Database, LoansTable } from "../db/index.js";
import { gravatarHashForEmail } from "../lib/gravatar.js";
import { notPinnedToLoan, notReservedByTrade } from "./query-helpers.js";

/** Raw loan row, for the service layer's authorization / state checks. */
export type Loan = Selectable<LoansTable>;

/** Fields set at creation; status defaults to `active` in the DB. */
export interface NewLoan {
  lenderUserId: string;
  /** Exactly one of borrowerUserId / borrowerName is non-null (enforced by the service). */
  borrowerUserId: string | null;
  borrowerName: string | null;
  printingId: string;
  cardId: string;
  quantity: number;
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

/**
 * Base DTO query: loan + lender user columns + (optional) borrower user
 * columns. Loans are personal records (no group), so there is no group join
 * and no contact-method loading, unlike trades.
 * @returns The Kysely select builder for loan DTO rows.
 */
function loanDtoBaseQuery(db: Kysely<Database>) {
  return db
    .selectFrom("loans as l")
    .innerJoin("users as lenderUser", "lenderUser.id", "l.lenderUserId")
    .leftJoin("users as borrowerUser", "borrowerUser.id", "l.borrowerUserId")
    .select([
      "l.id",
      "l.lenderUserId",
      "l.borrowerUserId",
      "l.borrowerName",
      "l.printingId",
      "l.cardId",
      "l.quantity",
      "l.returnedQuantity",
      "l.status",
      "l.acknowledgedAt",
      "l.rejectedAt",
      "l.createdAt",
      "l.updatedAt",
      "l.closedAt",
      "lenderUser.name as lenderName",
      "lenderUser.image as lenderImage",
      "lenderUser.email as lenderEmail",
      "borrowerUser.name as borrowerUserName",
      "borrowerUser.image as borrowerUserImage",
      "borrowerUser.email as borrowerUserEmail",
    ]);
}

type LoanDtoRow = Awaited<ReturnType<ReturnType<typeof loanDtoBaseQuery>["execute"]>>[number];

/**
 * Orient a raw joined row to the viewer. The lender sees the borrower (a user,
 * a free-text name, or neither after the borrower deleted their account); a
 * member borrower always sees the lender.
 * @returns The viewer-oriented loan DTO.
 */
function mapLoanRow(row: LoanDtoRow, userId: string): LoanResponse {
  const role: LoanRole = row.lenderUserId === userId ? "lender" : "borrower";

  let counterparty: LoanCounterparty | null = null;
  if (role === "borrower") {
    counterparty = {
      userId: row.lenderUserId,
      name: row.lenderName,
      image: row.lenderImage,
      gravatarHash: gravatarHashForEmail(row.lenderEmail),
    };
  } else if (row.borrowerUserId !== null) {
    counterparty = {
      userId: row.borrowerUserId,
      name: row.borrowerUserName,
      image: row.borrowerUserImage,
      // Non-null join match by FK; fall back defensively for the SET NULL race.
      gravatarHash: gravatarHashForEmail(row.borrowerUserEmail ?? ""),
    };
  }

  const needsAcknowledge =
    role === "borrower" &&
    row.status === "active" &&
    row.acknowledgedAt === null &&
    row.rejectedAt === null;

  return {
    id: row.id,
    role,
    counterparty,
    counterpartyName: role === "lender" ? row.borrowerName : null,
    printingId: row.printingId,
    cardId: row.cardId,
    quantity: row.quantity,
    returnedQuantity: row.returnedQuantity,
    status: row.status,
    acknowledgedAt: isoOrNull(row.acknowledgedAt),
    rejectedAt: isoOrNull(row.rejectedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    closedAt: isoOrNull(row.closedAt),
    actionNeeded: needsAcknowledge ? "acknowledge" : null,
  };
}

/**
 * Card lending data access (ADR-039). Pure queries/mutations — validation and
 * the pin/dispose orchestration live in the loans *service*. As with trades,
 * `updated_at` is maintained explicitly here on real transitions, driving the
 * newest-first ordering of the Loans page.
 * @returns An object with loan query methods bound to the given `db`.
 */
export function loansRepo(db: Kysely<Database>) {
  return {
    /**
     * Inserts an `active` loan.
     * @returns The created row.
     */
    create(values: NewLoan): Promise<Loan> {
      return db
        .insertInto("loans")
        .values({
          lenderUserId: values.lenderUserId,
          borrowerUserId: values.borrowerUserId,
          borrowerName: values.borrowerName,
          printingId: values.printingId,
          cardId: values.cardId,
          quantity: values.quantity,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    },

    /** @returns The raw loan row, or `undefined` if not found. */
    getById(id: string): Promise<Loan | undefined> {
      return db.selectFrom("loans").selectAll().where("id", "=", id).executeTakeFirst();
    },

    /** @returns All loans the viewer is a party to, newest change first, as DTOs. */
    async listForUser(userId: string): Promise<LoanResponse[]> {
      const rows = await loanDtoBaseQuery(db)
        .where((eb) =>
          eb.or([eb("l.lenderUserId", "=", userId), eb("l.borrowerUserId", "=", userId)]),
        )
        .orderBy("l.updatedAt", "desc")
        .execute();
      return rows.map((row) => mapLoanRow(row, userId));
    },

    /** @returns The single loan as a viewer-oriented DTO, or `undefined`. */
    async getDtoByIdForUser(id: string, userId: string): Promise<LoanResponse | undefined> {
      const row = await loanDtoBaseQuery(db)
        .where("l.id", "=", id)
        .where((eb) =>
          eb.or([eb("l.lenderUserId", "=", userId), eb("l.borrowerUserId", "=", userId)]),
        )
        .executeTakeFirst();
      return row === undefined ? undefined : mapLoanRow(row, userId);
    },

    /**
     * Active loans naming the viewer as borrower that they have neither
     * acknowledged nor rejected — the loans nav badge.
     * @returns The count of loans awaiting the viewer's acknowledgment.
     */
    async acknowledgeNeededCountForUser(userId: string): Promise<number> {
      const row = await db
        .selectFrom("loans")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("borrowerUserId", "=", userId)
        .where("status", "=", "active")
        .where("acknowledgedAt", "is", null)
        .where("rejectedAt", "is", null)
        .executeTakeFirst();
      return Number(row?.count ?? 0);
    },

    /**
     * Borrowed-in copy count per card (ADR-039) for the viewer's deck
     * inventory: active, acknowledged loans where the viewer is the borrower,
     * counting the outstanding quantity (`quantity - returned_quantity`).
     * Borrowed copies are physically in hand and buildable, so they reduce the
     * deck's missing count — mirrors the client's `aggregateBorrowedCounts`.
     * @returns Map from card id to outstanding borrowed quantity (only positive entries).
     */
    async borrowedCountByCard(userId: string): Promise<Map<string, number>> {
      const rows = await db
        .selectFrom("loans")
        .select((eb) => [
          "cardId",
          eb
            .cast<number>(eb.fn.sum(sql`quantity - returned_quantity`), "integer")
            .as("outstanding"),
        ])
        .where("borrowerUserId", "=", userId)
        .where("status", "=", "active")
        .where("acknowledgedAt", "is not", null)
        .groupBy("cardId")
        .having(sql`sum(quantity - returned_quantity)`, ">", 0)
        .execute();
      return new Map(rows.map((row) => [row.cardId, row.outstanding]));
    },

    /** @returns The card id of a printing, or `undefined` if the printing does not exist. */
    async printingCardId(printingId: string): Promise<string | undefined> {
      const row = await db
        .selectFrom("printings")
        .select("cardId")
        .where("id", "=", printingId)
        .executeTakeFirst();
      return row?.cardId;
    },

    /**
     * The lender's copies of a printing that no live claim holds: personal
     * collections only (group-owned copies are not the lender's to lend), and
     * pinned by neither a trade reservation nor another loan. Ordered so the
     * collection the lend action was triggered in is drawn from first (ADR-039
     * "auto, context first"), topping up from other collections oldest-first.
     * @returns The lendable copy ids, in pick order.
     */
    async listUnclaimedCopyIds(
      lenderUserId: string,
      printingId: string,
      contextCollectionId?: string,
    ): Promise<string[]> {
      let query = db
        .selectFrom("copies as cp")
        .innerJoin("collections as col", "col.id", "cp.collectionId")
        .select("cp.id")
        .where("col.userId", "=", lenderUserId)
        .where("cp.printingId", "=", printingId)
        .where(notReservedByTrade)
        .where(notPinnedToLoan);
      if (contextCollectionId !== undefined) {
        query = query.orderBy(sql`(cp.collection_id = ${contextCollectionId})`, "desc");
      }
      const rows = await query.orderBy("cp.createdAt", "asc").orderBy("cp.id", "asc").execute();
      return rows.map((row) => row.id);
    },

    /**
     * Pins the given copies to a loan. Throws a 23505 unique violation if any
     * copy is already pinned by another loan (the caller selects unclaimed
     * copies in the same transaction, so this only fires on a race).
     * @returns Nothing.
     */
    async pinCopies(loanId: string, copyIds: readonly string[]): Promise<void> {
      if (copyIds.length === 0) {
        return;
      }
      await db
        .insertInto("loanCopies")
        .values(copyIds.map((copyId) => ({ loanId, copyId })))
        .execute();
    },

    /** @returns The copy ids currently pinned (still out) on this loan. */
    async listPinnedCopyIds(loanId: string): Promise<string[]> {
      const rows = await db
        .selectFrom("loanCopies")
        .select("copyId")
        .where("loanId", "=", loanId)
        .execute();
      return rows.map((row) => row.copyId);
    },

    /**
     * Releases all pins for a loan (write-off, delete).
     * @returns Nothing.
     */
    async deletePinsForLoan(loanId: string): Promise<void> {
      await db.deleteFrom("loanCopies").where("loanId", "=", loanId).execute();
    },

    /**
     * Releases up to `count` pins for a loan (partial return). Copies of one
     * printing are fungible, so which pins go is arbitrary but stable.
     * @returns The released copy ids.
     */
    async releasePins(loanId: string, count: number): Promise<string[]> {
      const rows = await db
        .deleteFrom("loanCopies")
        .where("loanId", "=", loanId)
        .where("copyId", "in", (eb) =>
          eb
            .selectFrom("loanCopies")
            .select("copyId")
            .where("loanId", "=", loanId)
            .orderBy("copyId", "asc")
            .limit(count),
        )
        .returning("copyId")
        .execute();
      return rows.map((row) => row.copyId);
    },

    /**
     * The dispose/trade-accept guard: which of these copies are currently out
     * on a loan. Mirrors `cardTrades.filterReservedCopyIds`.
     * @returns The subset of the given ids pinned by any live loan.
     */
    async filterLoanedCopyIds(copyIds: readonly string[]): Promise<string[]> {
      if (copyIds.length === 0) {
        return [];
      }
      const rows = await db
        .selectFrom("loanCopies")
        .select("copyId")
        .where("copyId", "in", [...copyIds])
        .execute();
      return rows.map((row) => row.copyId);
    },

    /**
     * Records `count` copies as physically returned, closing the loan as
     * `returned` when everything is back. Guarded single statement: only the
     * lender, only while `active`, never past `quantity`.
     * @returns The number of rows updated (0 = state changed under the caller).
     */
    async recordReturn(loanId: string, lenderUserId: string, count: number): Promise<number> {
      const result = await db
        .updateTable("loans")
        .set({
          returnedQuantity: sql`returned_quantity + ${count}`,
          status: sql`CASE WHEN returned_quantity + ${count} = quantity THEN 'returned' ELSE status END`,
          closedAt: sql`CASE WHEN returned_quantity + ${count} = quantity THEN now() ELSE closed_at END`,
          updatedAt: sql`now()`,
        })
        .where("id", "=", loanId)
        .where("lenderUserId", "=", lenderUserId)
        .where("status", "=", "active")
        .where(sql<boolean>`returned_quantity + ${count} <= quantity`)
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Closes an active loan as `written_off` (lender only). Pin release and
     * the optional dispose live in the service.
     * @returns The number of rows updated (0 = state changed under the caller).
     */
    async markWrittenOff(loanId: string, lenderUserId: string): Promise<number> {
      const result = await db
        .updateTable("loans")
        .set({ status: "written_off", closedAt: sql`now()`, updatedAt: sql`now()` })
        .where("id", "=", loanId)
        .where("lenderUserId", "=", lenderUserId)
        .where("status", "=", "active")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * The borrower confirms they hold the copies; clears any earlier reject.
     * @returns The number of rows updated (0 = not the borrower or not active).
     */
    async acknowledge(loanId: string, borrowerUserId: string): Promise<number> {
      const result = await db
        .updateTable("loans")
        .set({ acknowledgedAt: sql`now()`, rejectedAt: null, updatedAt: sql`now()` })
        .where("id", "=", loanId)
        .where("borrowerUserId", "=", borrowerUserId)
        .where("status", "=", "active")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * The borrower disputes the loan ("I don't have this"); clears any earlier
     * acknowledgment. The loan stays active on the lender's side (their card is
     * still out) — rejection only flags it back to them.
     * @returns The number of rows updated (0 = not the borrower or not active).
     */
    async reject(loanId: string, borrowerUserId: string): Promise<number> {
      const result = await db
        .updateTable("loans")
        .set({ rejectedAt: sql`now()`, acknowledgedAt: null, updatedAt: sql`now()` })
        .where("id", "=", loanId)
        .where("borrowerUserId", "=", borrowerUserId)
        .where("status", "=", "active")
        .executeTakeFirst();
      return Number(result.numUpdatedRows);
    },

    /**
     * Deletes a loan outright (lender only, any status — a personal ledger,
     * history is best-effort per ADR-039). Pins cascade.
     * @returns The number of rows deleted.
     */
    async deleteByIdForLender(loanId: string, lenderUserId: string): Promise<number> {
      const result = await db
        .deleteFrom("loans")
        .where("id", "=", loanId)
        .where("lenderUserId", "=", lenderUserId)
        .executeTakeFirst();
      return Number(result.numDeletedRows);
    },

    /** @returns `true` when the two users share at least one friend group. */
    async isCoMember(userId: string, otherUserId: string): Promise<boolean> {
      const row = await db
        .selectFrom("friendGroupMembers as me")
        .innerJoin("friendGroupMembers as other", (join) =>
          join.onRef("other.groupId", "=", "me.groupId"),
        )
        .select("me.groupId")
        .where("me.userId", "=", userId)
        .where("other.userId", "=", otherUserId)
        .limit(1)
        .executeTakeFirst();
      return row !== undefined;
    },

    /**
     * Everyone sharing at least one friend group with the viewer — the member
     * half of the lend dialog's borrower picker.
     * @returns Distinct co-members, sorted by name.
     */
    async coMembersForUser(userId: string): Promise<LoanCounterparty[]> {
      const rows = await db
        .selectFrom("friendGroupMembers as me")
        .innerJoin("friendGroupMembers as other", (join) =>
          join.onRef("other.groupId", "=", "me.groupId").onRef("other.userId", "<>", "me.userId"),
        )
        .innerJoin("users as u", "u.id", "other.userId")
        .select(["u.id", "u.name", "u.image", "u.email"])
        .distinct()
        .where("me.userId", "=", userId)
        .orderBy("u.name", "asc")
        .execute();
      return rows.map((row) => ({
        userId: row.id,
        name: row.name,
        image: row.image,
        gravatarHash: gravatarHashForEmail(row.email),
      }));
    },

    /**
     * Free-text borrower names the lender has used before, most recent first —
     * the other half of the borrower picker.
     * @returns Up to `limit` distinct names.
     */
    async recentBorrowerNames(lenderUserId: string, limit: number): Promise<string[]> {
      const rows = await db
        .selectFrom("loans")
        .select("borrowerName")
        .select((eb) => eb.fn.max("createdAt").as("lastUsed"))
        .where("lenderUserId", "=", lenderUserId)
        .where("borrowerName", "is not", null)
        .groupBy("borrowerName")
        .orderBy("lastUsed", "desc")
        .limit(limit)
        .execute();
      return rows.map((row) => row.borrowerName).filter((name) => name !== null);
    },
  };
}
