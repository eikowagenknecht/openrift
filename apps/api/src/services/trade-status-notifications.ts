import type { Logger } from "@openrift/shared/logger";
import { getTradeRequestEmailCadence, isTradeStatusEmailEnabled } from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import type { createEmailSender } from "../email.js";
import type { TradeStatusUpdateGroup } from "../emails/trade-emails.js";
import { buildTradeStatusUpdateEmail } from "../emails/trade-emails.js";
import { buildUnsubscribeUrls } from "../emails/unsubscribe-token.js";
import type { QueuedStatusEmailRow } from "../repositories/card-trades.js";
import type { EmailNotificationContext } from "../repositories/user-preferences.js";
import { isRequestGroupDue } from "./trade-notifications.js";

type SendEmail = ReturnType<typeof createEmailSender>;

/**
 * Kill switch (ADR-030). Default on: absent (never seeded) or `enabled=true` →
 * send; toggle the flag off to stop the trade-status emails if a bug shows up.
 * Seeded `enabled=true` in KNOWN_FLAGS so creating it doesn't change behaviour.
 */
const TRADE_STATUS_EMAIL_FLAG = "trade-status-email";

/** Dependencies for the coalesced trade-status flush cron (ADR-030). */
export interface TradeStatusFlushDeps {
  repos: Repos;
  log: Logger;
  sendEmail: SendEmail;
  /** Web origin for deep links + the unsubscribe route (BETTER_AUTH_URL). */
  appBaseUrl: string;
  /** App secret used to sign the stateless unsubscribe token. */
  unsubscribeSecret: string;
}

export interface TradeStatusFlushResult {
  /** Distinct (actor, recipient) pairs whose burst was due. */
  pairs: number;
  /** Coalesced emails actually sent (gated + send didn't throw). */
  emailsSent: number;
  /** Queued status changes folded into sent emails. */
  events: number;
  /** Pair sends that threw. Without this a run where every send failed records
   *  the same all-zero summary as a run with nothing to send. */
  failed: number;
  /** Status changes claimed for a send that then threw. Claims are never
   *  released (at-most-once, ADR-030), so these are dropped, not retried. */
  eventsDropped: number;
}

/** A trade-status flush did nothing when no pair was due (flag off, or no queued
 *  transitions), so no email was sent and no event was folded in.
 *  @returns True when the run had no work to do. */
export function isTradeStatusFlushNoop(result: TradeStatusFlushResult): boolean {
  // `failed` needs no clause: only a due pair can fail, so any failure is
  // already counted in `pairs`.
  return result.pairs === 0 && result.emailsSent === 0 && result.events === 0;
}

/**
 * Splits a pair's rows into the trade ids to claim per marker column.
 * @returns The reserved- and closed-event trade ids.
 */
function idsByMarker(rows: readonly QueuedStatusEmailRow[]): {
  reservedEmailSentAt: string[];
  closedEmailSentAt: string[];
} {
  const reservedEmailSentAt: string[] = [];
  const closedEmailSentAt: string[] = [];
  for (const row of rows) {
    if (row.event === "reserved") {
      reservedEmailSentAt.push(row.id);
    } else {
      closedEmailSentAt.push(row.id);
    }
  }
  return { reservedEmailSentAt, closedEmailSentAt };
}

/**
 * Claims a pair's rows across both marker columns.
 * @returns The ids actually claimed by this call.
 */
async function claimPair(
  repos: Repos,
  rows: readonly QueuedStatusEmailRow[],
): Promise<Set<string>> {
  const { reservedEmailSentAt, closedEmailSentAt } = idsByMarker(rows);
  const claimed = new Set<string>();
  for (const id of await repos.cardTrades.claimStatusEmails(
    "reservedEmailSentAt",
    reservedEmailSentAt,
  )) {
    claimed.add(id);
  }
  for (const id of await repos.cardTrades.claimStatusEmails(
    "closedEmailSentAt",
    closedEmailSentAt,
  )) {
    claimed.add(id);
  }
  return claimed;
}

/**
 * Sends the coalesced trade-status emails (ADR-030): for each actor→recipient
 * pair whose burst of accept/decline/cancel actions is due under the recipient's
 * cadence (shared with trade requests, see {@link isRequestGroupDue}), folds all
 * that pair's queued transitions into one email to the party who didn't act. A
 * still-settling burst is left queued for a later tick; an opted-out recipient's
 * queue is claimed-and-suppressed so it isn't retried forever. Per-pair sends are
 * best-effort — a failure is logged, counted in `failed`, and the run continues.
 * @returns Counts of pairs emailed, emails sent and transitions included, plus
 *   the failed sends and the transitions dropped with them.
 */
export async function flushTradeStatusEmails(
  deps: TradeStatusFlushDeps,
): Promise<TradeStatusFlushResult> {
  const { repos, log, sendEmail, appBaseUrl, unsubscribeSecret } = deps;

  // Kill switch: leave queued rows untouched while off, so they resume when the
  // flag is turned back on.
  if ((await repos.featureFlags.isEnabled(TRADE_STATUS_EMAIL_FLAG)) === false) {
    return { pairs: 0, emailsSent: 0, events: 0, failed: 0, eventsDropped: 0 };
  }

  const pending = await repos.cardTrades.listPendingStatusEmails();
  if (pending.length === 0) {
    return { pairs: 0, emailsSent: 0, events: 0, failed: 0, eventsDropped: 0 };
  }

  // The query orders by (recipient, actor, updated_at), so each pair's rows are
  // contiguous and chronological.
  const byPair = Map.groupBy(pending, (row) => `${row.recipientUserId}|${row.actorUserId}`);

  const now = new Date();
  const contextByUser = new Map<string, EmailNotificationContext | undefined>();
  const labelsByGroup = new Map<string, Map<string, string>>();
  let pairs = 0;
  let emailsSent = 0;
  let events = 0;
  let failed = 0;
  let eventsDropped = 0;

  for (const rows of byPair.values()) {
    const { recipientUserId, actorUserId } = rows[0];

    if (!contextByUser.has(recipientUserId)) {
      contextByUser.set(
        recipientUserId,
        await repos.userPreferences.getEmailNotificationContext(recipientUserId),
      );
    }
    const context = contextByUser.get(recipientUserId);
    if (
      context === undefined ||
      !context.emailVerified ||
      !isTradeStatusEmailEnabled(context.emailNotifications)
    ) {
      // Suppressed: claim the queued rows so we don't retry this pair every tick.
      await claimPair(repos, rows);
      continue;
    }

    // Apply the recipient's cadence (shared with trade requests). A still-settling
    // burst stays queued for a later tick rather than being sent early.
    const cadence = getTradeRequestEmailCadence(context.emailNotifications);
    if (
      !isRequestGroupDue(
        cadence,
        rows.map((row) => row.eventAt),
        now,
      )
    ) {
      continue;
    }
    pairs += 1;

    const claimedIds = await claimPair(repos, rows);
    const claimedRows = rows.filter((row) => claimedIds.has(row.id));
    if (claimedRows.length === 0) {
      continue;
    }

    // Resolve the actor's display label, and collect card ids.
    let actorLabel: string | null = null;
    const cardIds = new Set<string>();
    for (const row of claimedRows) {
      cardIds.add(row.cardId);
      if (actorLabel === null) {
        if (!labelsByGroup.has(row.groupId)) {
          const members = await repos.friendGroups.listMembers(row.groupId);
          const labels = new Map<string, string>();
          for (const member of members) {
            labels.set(member.userId, member.userName ?? "A member");
          }
          labelsByGroup.set(row.groupId, labels);
        }
        actorLabel = labelsByGroup.get(row.groupId)?.get(actorUserId) ?? null;
      }
    }

    const cards = await repos.catalog.cardsByIds([...cardIds]);
    const nameByCard = new Map(cards.map((card) => [card.id, card.name]));

    // One section per group (a pair can share more than one group). The email
    // folds several status changes together, so it is not about a single trade:
    // each section is a friend group, headed and buttoned by its name, and stays
    // on the group deep link rather than the person-level sheet.
    const sections: TradeStatusUpdateGroup[] = [];
    const sectionByGroup = new Map<string, TradeStatusUpdateGroup>();
    for (const row of claimedRows) {
      let section = sectionByGroup.get(row.groupId);
      if (section === undefined) {
        section = {
          groupName: row.groupName,
          tradesUrl: `${appBaseUrl}/groups/${row.groupSlug}/trades`,
          updates: [],
        };
        sectionByGroup.set(row.groupId, section);
        sections.push(section);
      }
      section.updates.push({
        cardName: nameByCard.get(row.cardId) ?? "a card",
        quantity: row.quantity,
        event: row.event,
      });
    }

    const { pageUrl, oneClickUrl } = buildUnsubscribeUrls(
      appBaseUrl,
      unsubscribeSecret,
      recipientUserId,
      "tradeStatus",
    );
    const { subject, html } = buildTradeStatusUpdateEmail({
      recipientName: context.name,
      actorName: actorLabel,
      groups: sections,
      unsubscribeUrl: pageUrl,
    });

    try {
      await sendEmail({ to: context.email, subject, html, listUnsubscribeUrl: oneClickUrl });
      emailsSent += 1;
      events += claimedRows.length;
    } catch (error) {
      failed += 1;
      eventsDropped += claimedRows.length;
      log.error(
        { err: error, recipientUserId, actorUserId },
        "Failed to send coalesced trade-status email",
      );
    }
  }

  return { pairs, emailsSent, events, failed, eventsDropped };
}
