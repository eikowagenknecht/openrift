import { formatContactMethodsSummary } from "@openrift/shared";
import type { Logger } from "@openrift/shared/logger";
import {
  getTradeRequestEmailCadence,
  isTradeRequestEmailEnabled,
  TRADE_REQUEST_EMAIL_CADENCE_MINUTES,
} from "@openrift/shared/types";
import type { TradeRequestEmailCadence } from "@openrift/shared/types";

import type { Repos } from "../deps.js";
import type { createEmailSender } from "../email.js";
import type { CoalescedRequestGroup } from "../emails/trade-emails.js";
import {
  buildCoalescedTradeRequestsEmail,
  buildTradeRequestEmail,
} from "../emails/trade-emails.js";
import { buildUnsubscribeUrls } from "../emails/unsubscribe-token.js";
import { toCardTradeResponse } from "../lib/card-trade-presenters.js";
import type { LiveCardTrade } from "../repositories/card-trades.js";
import type { EmailNotificationContext } from "../repositories/user-preferences.js";

type SendEmail = ReturnType<typeof createEmailSender>;

/**
 * Kill switch, an api-scoped site setting. Default on: absent (never created)
 * or `"true"` → send; set it to `"false"` to stop sending if a bug shows up.
 * Keep in sync with the admin site-settings page. Gates both the instant email
 * and the coalesced flush.
 */
export const TRADE_REQUEST_EMAIL_SETTING = "trade-request-email";

/**
 * Decides whether a recipient's queued burst of requests from one sender is due
 * for its coalesced email. `instant` is always due (the flush only sees instant
 * rows as a fallback when the instant send failed). An `Nmin` cadence is a
 * trailing debounce: send once the burst has been quiet for the window (N min
 * since the last request), capped at twice the window so a never-ending
 * trickle can't defer the email forever.
 */
export function isRequestGroupDue(
  cadence: TradeRequestEmailCadence,
  createdAts: readonly Date[],
  now: Date,
): boolean {
  const windowMinutes = TRADE_REQUEST_EMAIL_CADENCE_MINUTES[cadence];
  if (windowMinutes === 0) {
    return true;
  }
  if (createdAts.length === 0) {
    return false;
  }
  const windowMs = windowMinutes * 60_000;
  const nowMs = now.getTime();
  const times = createdAts.map((createdAt) => createdAt.getTime());
  const quietFor = nowMs - Math.max(...times);
  const agedFor = nowMs - Math.min(...times);
  return quietFor >= windowMs || agedFor >= 2 * windowMs;
}

export interface TradeEmailDeps {
  sendEmail: SendEmail;
  appBaseUrl: string;
  unsubscribeSecret: string;
  log: Logger;
}

/**
 * Emails the non-initiator that a trade was requested. Gated by the
 * recipient's `tradeRequests` preference (on by default) and a verified email.
 *
 * Honours the recipient's cadence: `instant` claims and sends the email right
 * away; any `Nmin` cadence leaves the request queued (`request_email_sent_at`
 * stays NULL) for {@link flushCoalescedTradeRequests} to debounce and fold into
 * one follow-up.
 *
 * Best-effort and side-effect-only: it never throws. The caller invokes it
 * after the trade row has committed and outside any transaction, so a mail
 * failure can never roll back or 500 the trade.
 */
export async function sendTradeRequestEmail(
  repos: Repos,
  trade: LiveCardTrade,
  deps: TradeEmailDeps,
): Promise<void> {
  try {
    // Kill switch (default on): only an explicit `false` stops sending.
    if ((await repos.siteSettings.getBool(TRADE_REQUEST_EMAIL_SETTING)) === false) {
      return;
    }

    const recipientUserId = trade.initiator === "giver" ? trade.receiverUserId : trade.giverUserId;

    const context = await repos.userPreferences.getEmailNotificationContext(recipientUserId);
    if (context === undefined || !context.emailVerified) {
      return;
    }
    if (!isTradeRequestEmailEnabled(context.emailNotifications)) {
      return;
    }

    // A non-instant cadence debounces: leave the request queued (NULL) for the
    // flush to fold into one email. Only the instant cadence sends from here.
    if (getTradeRequestEmailCadence(context.emailNotifications) !== "instant") {
      return;
    }

    // Instant cadence: claim this row so the flush won't also send it, then
    // email. If the claim loses (e.g. the flush grabbed it first), skip.
    const claimed = await repos.cardTrades.claimRequestEmails([trade.id]);
    if (claimed.length === 0) {
      return;
    }

    // The recipient-oriented DTO carries the initiator as `counterparty` (name,
    // user id, revealed contact methods) — no extra user query.
    const row = await repos.cardTrades.getDtoRowByIdForUser(trade.id, recipientUserId);
    if (row === undefined) {
      return;
    }
    const dto = toCardTradeResponse(row, recipientUserId);
    const initiatorName = dto.counterparty.name;
    const initiatorContact = formatContactMethodsSummary(dto.counterparty.contactMethods);

    const cards = await repos.catalog.cardsByIds([trade.cardId]);
    const cardName = cards[0]?.name ?? "a card";

    // One trade, so it links to the counterparty's person-level sheet.
    if (dto.counterparty.userId === null) {
      // The initiator closed their account between the request and this send.
      return;
    }
    const sheetUrl = `${deps.appBaseUrl}/trades/${dto.counterparty.userId}`;
    const { pageUrl, oneClickUrl } = buildUnsubscribeUrls(
      deps.appBaseUrl,
      deps.unsubscribeSecret,
      recipientUserId,
      "tradeRequests",
    );

    const { subject, html } = buildTradeRequestEmail({
      recipientName: context.name,
      initiatorName,
      cardName,
      quantity: trade.quantity,
      // receiver-initiated = the initiator wants the card; giver-initiated = offer.
      kind: trade.initiator === "receiver" ? "wants" : "offers",
      initiatorContact,
      sheetUrl,
      unsubscribeUrl: pageUrl,
    });

    await deps.sendEmail({ to: context.email, subject, html, listUnsubscribeUrl: oneClickUrl });
  } catch (error) {
    deps.log.error({ err: error, tradeId: trade.id }, "Failed to send trade-request email");
  }
}

export interface CoalescedRequestFlushDeps {
  repos: Repos;
  log: Logger;
  sendEmail: SendEmail;
  appBaseUrl: string;
  unsubscribeSecret: string;
}

export interface CoalescedRequestFlushResult {
  pairs: number;
  emailsSent: number;
  requests: number;
  failed: number;
  requestsDropped: number;
}

export function isTradeRequestFlushNoop(result: CoalescedRequestFlushResult): boolean {
  // `failed` is already implied by `pairs`: only a due pair can fail.
  return result.pairs === 0 && result.emailsSent === 0 && result.requests === 0;
}

/**
 * Sends the coalesced follow-up emails: for each sender→recipient pair whose
 * burst is due under the recipient's cadence (see {@link isRequestGroupDue}),
 * folds all that pair's queued requests into one email. A still-settling burst
 * is left queued (not claimed) for a later tick; an opted-out recipient's queue
 * is claimed-and-suppressed so it isn't retried forever. Per-pair sends are
 * best-effort — a failure is logged, counted in `failed`, and the run
 * continues.
 */
export async function flushCoalescedTradeRequests(
  deps: CoalescedRequestFlushDeps,
): Promise<CoalescedRequestFlushResult> {
  const { repos, log, sendEmail, appBaseUrl, unsubscribeSecret } = deps;

  // Kill switch (shared with the instant email): leave queued rows untouched
  // while off, so they resume when the setting is turned back on.
  if ((await repos.siteSettings.getBool(TRADE_REQUEST_EMAIL_SETTING)) === false) {
    return { pairs: 0, emailsSent: 0, requests: 0, failed: 0, requestsDropped: 0 };
  }

  const pending = await repos.cardTrades.listPendingRequestEmails();
  if (pending.length === 0) {
    return { pairs: 0, emailsSent: 0, requests: 0, failed: 0, requestsDropped: 0 };
  }

  // The query orders by (recipient, sender, created_at), so each pair's rows
  // are contiguous and chronological.
  const byPair = Map.groupBy(pending, (row) => `${row.recipientUserId}|${row.senderUserId}`);

  const now = new Date();
  const contextByUser = new Map<string, EmailNotificationContext | undefined>();
  const labelsByGroup = new Map<string, Map<string, string>>();
  let pairs = 0;
  let emailsSent = 0;
  let requests = 0;
  let failed = 0;
  let requestsDropped = 0;

  for (const rows of byPair.values()) {
    const [firstRow] = rows;
    if (!firstRow) {
      continue;
    }
    const { recipientUserId, senderUserId } = firstRow;

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
      // Suppressed: claim so this pair isn't retried every tick.
      await repos.cardTrades.claimRequestEmails(rows.map((row) => row.id));
      continue;
    }

    // A still-settling burst stays queued, unclaimed, for a later tick.
    const cadence = getTradeRequestEmailCadence(context.emailNotifications);
    if (
      !isRequestGroupDue(
        cadence,
        rows.map((row) => row.createdAt),
        now,
      )
    ) {
      continue;
    }
    pairs += 1;

    // Claim every queued row for this pair (skips any the instant path grabbed
    // concurrently). Claimed rows won't be reconsidered next tick.
    const claimedIds = new Set(
      await repos.cardTrades.claimRequestEmails(rows.map((row) => row.id)),
    );
    const claimedRows = rows.filter((row) => claimedIds.has(row.id));
    if (claimedRows.length === 0) {
      continue;
    }

    let senderLabel: string | null = null;
    const cardIds = new Set<string>();
    for (const row of claimedRows) {
      cardIds.add(row.cardId);
      if (senderLabel === null) {
        if (!labelsByGroup.has(row.groupId)) {
          const members = await repos.friendGroups.listMembers(row.groupId);
          const labels = new Map<string, string>();
          for (const member of members) {
            labels.set(member.userId, member.userName ?? "A member");
          }
          labelsByGroup.set(row.groupId, labels);
        }
        senderLabel = labelsByGroup.get(row.groupId)?.get(senderUserId) ?? null;
      }
    }

    const cards = await repos.catalog.cardsByIds([...cardIds]);
    const nameByCard = new Map(cards.map((card) => [card.id, card.name]));

    // One section per group: a pair can share more than one group.
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

    const { pageUrl, oneClickUrl } = buildUnsubscribeUrls(
      appBaseUrl,
      unsubscribeSecret,
      recipientUserId,
      "tradeRequests",
    );
    const { subject, html } = buildCoalescedTradeRequestsEmail({
      recipientName: context.name,
      senderName: senderLabel,
      groups: sections,
      unsubscribeUrl: pageUrl,
    });

    try {
      await sendEmail({ to: context.email, subject, html, listUnsubscribeUrl: oneClickUrl });
      emailsSent += 1;
      requests += claimedRows.length;
    } catch (error) {
      failed += 1;
      requestsDropped += claimedRows.length;
      log.error(
        { err: error, recipientUserId, senderUserId },
        "Failed to send coalesced trade-request email",
      );
    }
  }

  return { pairs, emailsSent, requests, failed, requestsDropped };
}
