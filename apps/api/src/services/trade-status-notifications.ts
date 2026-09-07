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

/** Site setting; `"false"` disables sending. Keep in sync with the admin site-settings page. */
const TRADE_STATUS_EMAIL_SETTING = "trade-status-email";

export interface TradeStatusFlushDeps {
  repos: Repos;
  log: Logger;
  sendEmail: SendEmail;
  appBaseUrl: string;
  unsubscribeSecret: string;
}

export interface TradeStatusFlushResult {
  pairs: number;
  emailsSent: number;
  events: number;
  failed: number;
  eventsDropped: number;
}

export function isTradeStatusFlushNoop(result: TradeStatusFlushResult): boolean {
  return result.pairs === 0 && result.emailsSent === 0 && result.events === 0;
}

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

/** Cadence gating is shared with trade requests, see {@link isRequestGroupDue}. */
export async function flushTradeStatusEmails(
  deps: TradeStatusFlushDeps,
): Promise<TradeStatusFlushResult> {
  const { repos, log, sendEmail, appBaseUrl, unsubscribeSecret } = deps;

  // While off, queued rows are left untouched and resume once turned back on.
  if ((await repos.siteSettings.getBool(TRADE_STATUS_EMAIL_SETTING)) === false) {
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
      await claimPair(repos, rows);
      continue;
    }

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
