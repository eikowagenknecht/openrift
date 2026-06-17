import type { Logger } from "@openrift/shared/logger";
import { isTradeRequestEmailEnabled } from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import type { createEmailSender } from "../email.js";
import type { CoalescedRequestGroup } from "../emails/trade-emails.js";
import {
  buildCoalescedTradeRequestsEmail,
  buildTradeRequestEmail,
} from "../emails/trade-emails.js";
import { signUnsubscribeToken } from "../emails/unsubscribe-token.js";
import type { CardTrade } from "../repositories/card-trades.js";
import type { EmailNotificationContext } from "../repositories/user-preferences.js";

type SendEmail = ReturnType<typeof createEmailSender>;

/**
 * Kill switch (ADR-030). Default on: absent (never seeded) or `enabled=true` →
 * send; toggle the flag off to stop sending if a bug shows up. Seeded
 * `enabled=true` in KNOWN_FLAGS so creating it doesn't change behaviour. Keep
 * in sync with the admin feature-flags page. Gates both the instant email and
 * the coalesced flush.
 */
export const TRADE_REQUEST_EMAIL_FLAG = "trade-request-email";

/**
 * Coalescing window (ADR-030). The first request from one sender to one
 * recipient emails instantly; further requests within this window of the last
 * email to that pair are queued and folded into a single follow-up by the
 * flush cron — so a burst of requests can't spam the recipient's inbox.
 */
export const REQUEST_EMAIL_COALESCE_WINDOW_SECONDS = 5 * 60;

/** Dependencies the trade-request email needs beyond `repos` (ADR-030). */
export interface TradeEmailDeps {
  sendEmail: SendEmail;
  /** Web origin for deep links + the unsubscribe route (BETTER_AUTH_URL). */
  appBaseUrl: string;
  /** App secret used to sign the stateless unsubscribe token. */
  unsubscribeSecret: string;
  log: Logger;
}

/**
 * Emails the non-initiator that a trade was requested (ADR-030). Gated by the
 * recipient's `tradeRequests` preference (on by default) and a verified email.
 *
 * Leading-edge throttled: only the first request to this recipient from this
 * sender within {@link REQUEST_EMAIL_COALESCE_WINDOW_SECONDS} sends here; later
 * requests in the window are left queued (`request_email_sent_at` stays NULL)
 * for {@link flushCoalescedTradeRequests} to fold into one follow-up.
 *
 * Best-effort and side-effect-only: it never throws. The caller invokes it
 * after the trade row has committed and outside any transaction, so a mail
 * failure can never roll back or 500 the trade.
 */
export async function sendTradeRequestEmail(
  repos: Repos,
  trade: CardTrade,
  deps: TradeEmailDeps,
): Promise<void> {
  try {
    // Kill switch (default on): stop all trade-request emails only if the flag
    // has been explicitly turned off.
    if ((await repos.featureFlags.isEnabled(TRADE_REQUEST_EMAIL_FLAG)) === false) {
      return;
    }

    // The recipient is the *non-initiator*; the sender is the initiator.
    const recipientUserId = trade.initiator === "giver" ? trade.receiverUserId : trade.giverUserId;
    const senderUserId = trade.initiator === "giver" ? trade.giverUserId : trade.receiverUserId;

    const context = await repos.userPreferences.getEmailNotificationContext(recipientUserId);
    if (context === undefined || !context.emailVerified) {
      return;
    }
    if (!isTradeRequestEmailEnabled(context.emailNotifications)) {
      return;
    }

    // Leading-edge claim: send instantly only if no email has gone to this
    // sender→recipient pair within the window. Otherwise the trade stays queued
    // (NULL) and the flush coalesces it — preventing a burst of instant emails.
    const isLeading = await repos.cardTrades.claimInstantRequestEmail(
      trade.id,
      senderUserId,
      recipientUserId,
      REQUEST_EMAIL_COALESCE_WINDOW_SECONDS,
    );
    if (!isLeading) {
      return;
    }

    // The recipient-oriented DTO carries the initiator as `counterparty` (name +
    // nickname) and the group slug for the deep link — no extra user query.
    const dto = await repos.cardTrades.getDtoByIdForUser(trade.id, recipientUserId);
    if (dto === undefined) {
      return;
    }
    const initiatorName = dto.counterparty.nickname ?? dto.counterparty.name;

    const cards = await repos.catalog.cardsByIds([trade.cardId]);
    const cardName = cards[0]?.name ?? "a card";

    const tradesUrl = `${deps.appBaseUrl}/groups/${dto.groupSlug}/trades`;
    const token = signUnsubscribeToken(deps.unsubscribeSecret, recipientUserId, "tradeRequests");
    const unsubscribeUrl = `${deps.appBaseUrl}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`;

    const { subject, html } = buildTradeRequestEmail({
      recipientName: context.name,
      initiatorName,
      cardName,
      quantity: trade.quantity,
      // receiver-initiated = the initiator wants the card; giver-initiated = offer.
      kind: trade.initiator === "receiver" ? "wants" : "offers",
      tradesUrl,
      unsubscribeUrl,
    });

    await deps.sendEmail({ to: context.email, subject, html });
  } catch (error) {
    deps.log.error({ err: error, tradeId: trade.id }, "Failed to send trade-request email");
  }
}

/** Dependencies for the coalesced trade-request flush cron (ADR-030). */
export interface CoalescedRequestFlushDeps {
  repos: Repos;
  log: Logger;
  sendEmail: SendEmail;
  /** Web origin for deep links + the unsubscribe route (BETTER_AUTH_URL). */
  appBaseUrl: string;
  /** App secret used to sign the stateless unsubscribe token. */
  unsubscribeSecret: string;
  /** Defaults to {@link REQUEST_EMAIL_COALESCE_WINDOW_SECONDS}; overridable in tests. */
  windowSeconds?: number;
}

export interface CoalescedRequestFlushResult {
  /** Distinct (sender, recipient) pairs whose burst had settled. */
  pairs: number;
  /** Coalesced emails actually sent (gated + send didn't throw). */
  emailsSent: number;
  /** Queued requests folded into sent emails. */
  requests: number;
}

/**
 * Sends the coalesced follow-up emails (ADR-030): for each sender→recipient
 * pair whose burst has settled (no email within the window), folds all that
 * pair's queued requests into one email. Claiming marks the requests handled
 * whether or not we send, so an opted-out recipient's queue is suppressed
 * rather than retried every tick. Per-pair sends are best-effort — a failure is
 * logged and the run continues.
 * @returns Counts of pairs considered, emails sent, and requests included.
 */
export async function flushCoalescedTradeRequests(
  deps: CoalescedRequestFlushDeps,
): Promise<CoalescedRequestFlushResult> {
  const { repos, log, sendEmail, appBaseUrl, unsubscribeSecret } = deps;
  const windowSeconds = deps.windowSeconds ?? REQUEST_EMAIL_COALESCE_WINDOW_SECONDS;

  // Kill switch (shared with the instant email): leave queued rows untouched
  // while off, so they resume when the flag is turned back on.
  if ((await repos.featureFlags.isEnabled(TRADE_REQUEST_EMAIL_FLAG)) === false) {
    return { pairs: 0, emailsSent: 0, requests: 0 };
  }

  const due = await repos.cardTrades.listDueCoalescedRequests(windowSeconds);
  if (due.length === 0) {
    return { pairs: 0, emailsSent: 0, requests: 0 };
  }

  // The query orders by (recipient, sender, created_at), so each pair's rows
  // are contiguous and chronological.
  const byPair = Map.groupBy(due, (row) => `${row.recipientUserId}|${row.senderUserId}`);

  const contextByUser = new Map<string, EmailNotificationContext | undefined>();
  const labelsByGroup = new Map<string, Map<string, string>>();
  let pairs = 0;
  let emailsSent = 0;
  let requests = 0;

  for (const rows of byPair.values()) {
    pairs += 1;
    const { recipientUserId, senderUserId } = rows[0];

    // Claim every queued row for this pair (skips any the instant path grabbed
    // concurrently). Claimed rows won't be reconsidered next tick — this also
    // suppresses an opted-out recipient's queue below.
    const claimedIds = new Set(
      await repos.cardTrades.claimRequestEmails(rows.map((row) => row.id)),
    );
    const claimedRows = rows.filter((row) => claimedIds.has(row.id));
    if (claimedRows.length === 0) {
      continue;
    }

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
      !isTradeRequestEmailEnabled(context.emailNotifications)
    ) {
      // Suppressed: the claimed rows stay marked so we don't retry, no email.
      continue;
    }

    // Resolve the sender's label (nickname preferred), and collect card ids.
    let senderLabel: string | null = null;
    const cardIds = new Set<string>();
    for (const row of claimedRows) {
      cardIds.add(row.cardId);
      if (senderLabel === null) {
        if (!labelsByGroup.has(row.groupId)) {
          const members = await repos.friendGroups.listMembers(row.groupId);
          const labels = new Map<string, string>();
          for (const member of members) {
            labels.set(member.userId, member.nickname ?? member.userName ?? "A member");
          }
          labelsByGroup.set(row.groupId, labels);
        }
        senderLabel = labelsByGroup.get(row.groupId)?.get(senderUserId) ?? null;
      }
    }

    const cards = await repos.catalog.cardsByIds([...cardIds]);
    const nameByCard = new Map(cards.map((card) => [card.id, card.name]));

    // One section per group (a pair can share more than one group).
    const sections: CoalescedRequestGroup[] = [];
    const sectionByGroup = new Map<string, CoalescedRequestGroup>();
    for (const row of claimedRows) {
      let section = sectionByGroup.get(row.groupId);
      if (section === undefined) {
        section = {
          groupName: row.groupName,
          tradesUrl: `${appBaseUrl}/groups/${row.groupSlug}/trades`,
          requests: [],
        };
        sectionByGroup.set(row.groupId, section);
        sections.push(section);
      }
      section.requests.push({
        cardName: nameByCard.get(row.cardId) ?? "a card",
        quantity: row.quantity,
        // receiver-initiated = the sender wants your card; giver-initiated = offer.
        kind: row.initiator === "receiver" ? "wants" : "offers",
      });
    }

    const token = signUnsubscribeToken(unsubscribeSecret, recipientUserId, "tradeRequests");
    const unsubscribeUrl = `${appBaseUrl}/api/v1/unsubscribe?token=${encodeURIComponent(token)}`;
    const { subject, html } = buildCoalescedTradeRequestsEmail({
      recipientName: context.name,
      senderName: senderLabel,
      groups: sections,
      unsubscribeUrl,
    });

    try {
      await sendEmail({ to: context.email, subject, html });
      emailsSent += 1;
      requests += claimedRows.length;
    } catch (error) {
      log.error(
        { err: error, recipientUserId, senderUserId },
        "Failed to send coalesced trade-request email",
      );
    }
  }

  return { pairs, emailsSent, requests };
}
