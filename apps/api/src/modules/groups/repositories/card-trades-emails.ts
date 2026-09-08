import type { CardTradeInitiator } from "@openrift/shared/types/api/card-trade";
import type { Kysely } from "kysely";
import { sql } from "kysely";

import type { Database } from "../../../db/tables.js";

export interface QueuedRequestEmailRow {
  id: string;
  groupId: string;
  groupSlug: string;
  groupName: string;
  cardId: string;
  printingId: string;
  quantity: number;
  initiator: CardTradeInitiator;
  /** The initiator — whose burst of requests is being coalesced. */
  senderUserId: string;
  /** The non-initiator — who receives the email. */
  recipientUserId: string;
  /** When the request was created — drives the recipient's debounce window. */
  createdAt: Date;
}

type TradeStatusEmailEvent = "reserved" | "declined" | "cancelled";

export interface QueuedStatusEmailRow {
  id: string;
  groupId: string;
  groupSlug: string;
  groupName: string;
  cardId: string;
  quantity: number;
  /** Which transition fired — drives the per-line copy and the marker to claim. */
  event: TradeStatusEmailEvent;
  /** Who caused the transition — whose burst is coalesced (the email's subject). */
  actorUserId: string;
  /** The other party — who didn't act, and receives the email. */
  recipientUserId: string;
  /** When the transition happened — drives the recipient's debounce window. */
  eventAt: Date;
}

/** The per-trade marker column a queued status email stamps once sent/suppressed. */
export type TradeStatusEmailMarker = "reservedEmailSentAt" | "closedEmailSentAt";

/**
 * The queue side of trade notification email: the rows still awaiting one, and
 * the claim that stops a concurrent flush from double-sending.
 */
export function cardTradeEmailsRepo(db: Kysely<Database>) {
  return {
    /**
     * Queued (un-notified) pending request rows, ordered so the flush can group
     * consecutive rows by (recipient, sender). Joins the group for the email's
     * deep link and returns `createdAt` so the service can apply each
     * recipient's debounce window. No window filter here — due-ness is decided
     * per recipient in {@link flushCoalescedTradeRequests}.
     */
    async listPendingRequestEmails(): Promise<QueuedRequestEmailRow[]> {
      const result = await sql<QueuedRequestEmailRow>`
        SELECT
          t.id,
          t.group_id,
          g.slug AS group_slug,
          g.name AS group_name,
          t.card_id,
          t.printing_id,
          t.quantity,
          t.initiator,
          t.created_at,
          (CASE WHEN t.initiator = 'giver' THEN t.giver_user_id ELSE t.receiver_user_id END) AS sender_user_id,
          (CASE WHEN t.initiator = 'giver' THEN t.receiver_user_id ELSE t.giver_user_id END) AS recipient_user_id
        FROM card_trades t
        JOIN friend_groups g ON g.id = t.group_id
        WHERE t.status = 'pending'
          AND t.request_email_sent_at IS NULL
          AND t.expires_at > now()
        ORDER BY recipient_user_id, sender_user_id, t.created_at
      `.execute(db);
      return result.rows;
    },

    /**
     * Stamps the given trades as emailed and returns the ids actually claimed:
     * only those still un-notified (NULL), so the flush never double-claims a
     * trade the instant path took concurrently. Used both to mark a coalesced
     * email sent and to suppress an opted-out recipient's queue.
     */
    async claimRequestEmails(tradeIds: readonly string[]): Promise<string[]> {
      if (tradeIds.length === 0) {
        return [];
      }
      const result = await db
        .updateTable("cardTrades")
        .set({ requestEmailSentAt: sql`now()` })
        .where("id", "in", [...tradeIds])
        .where("requestEmailSentAt", "is", null)
        .returning("id")
        .execute();
      return result.map((row) => row.id);
    },

    /**
     * Queued (un-notified) status transitions awaiting a coalesced email: the
     * still-`reserved` rows whose reserve email hasn't been sent, plus the
     * `declined`/`cancelled` rows whose close email hasn't been sent. System
     * transitions (`last_actor_user_id IS NULL` — auto-cancel, expiry) are
     * excluded: nobody to attribute, and expiry is intentionally silent. The
     * recipient is always the party who didn't act. Ordered so the flush can
     * group consecutive rows by (recipient, actor); due-ness is decided per
     * recipient in {@link flushTradeStatusEmails}.
     */
    async listPendingStatusEmails(): Promise<QueuedStatusEmailRow[]> {
      const result = await sql<QueuedStatusEmailRow>`
        SELECT
          t.id,
          t.group_id,
          g.slug AS group_slug,
          g.name AS group_name,
          t.card_id,
          t.quantity,
          (CASE WHEN t.status = 'reserved' THEN 'reserved' ELSE t.status END) AS event,
          t.last_actor_user_id AS actor_user_id,
          (CASE WHEN t.last_actor_user_id = t.giver_user_id
                THEN t.receiver_user_id ELSE t.giver_user_id END) AS recipient_user_id,
          t.updated_at AS event_at
        FROM card_trades t
        JOIN friend_groups g ON g.id = t.group_id
        WHERE t.last_actor_user_id IS NOT NULL
          AND (
            (t.status = 'reserved' AND t.reserved_email_sent_at IS NULL)
            OR (t.status IN ('declined', 'cancelled') AND t.closed_email_sent_at IS NULL)
          )
        ORDER BY recipient_user_id, actor_user_id, t.updated_at
      `.execute(db);
      return result.rows;
    },

    /**
     * Stamps the given trades' status-email marker and returns the ids
     * actually claimed: only those still un-notified (NULL), so a concurrent
     * flush tick never double-sends. The reserve and close events use separate
     * marker columns because one trade can fire both across its life
     * (reserved, then cancelled-from-reserved).
     */
    async claimStatusEmails(
      marker: TradeStatusEmailMarker,
      tradeIds: readonly string[],
    ): Promise<string[]> {
      if (tradeIds.length === 0) {
        return [];
      }
      const result = await db
        .updateTable("cardTrades")
        .set({ [marker]: sql`now()` })
        .where("id", "in", [...tradeIds])
        .where(marker, "is", null)
        .returning("id")
        .execute();
      return result.map((row) => row.id);
    },
  };
}
