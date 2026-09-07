import type { Logger } from "@openrift/shared/logger";

import type { Repos } from "../../../deps.js";
import type { createEmailSender } from "../../../email.js";
import type { DigestGroupSection } from "../../../emails/trade-emails.js";
import { buildTradeMatchDigestEmail } from "../../../emails/trade-emails.js";
import { buildUnsubscribeUrls } from "../../../emails/unsubscribe-token.js";
import type { IncomingMatchFeedRow } from "../repositories/friend-group-matches.js";

type SendEmail = ReturnType<typeof createEmailSender>;

const DIGEST_MATCH_LIMIT = 500;

export const TRADE_MATCH_DIGEST_SETTING = "trade-match-digest";

export interface TradeMatchDigestDeps {
  repos: Repos;
  log: Logger;
  sendEmail: SendEmail;
  appBaseUrl: string;
  unsubscribeSecret: string;
  sinceTimestamp: Date | null;
}

export interface TradeMatchDigestResult {
  recipients: number;
  emailsSent: number;
  matches: number;
  failed: number;
  matchesDropped: number;
}

export function isTradeMatchDigestNoop(result: TradeMatchDigestResult): boolean {
  return result.recipients === 0 && result.emailsSent === 0 && result.matches === 0;
}

export function extractDigestWatermark(result: unknown): Date | null {
  if (result === null || typeof result !== "object") {
    return null;
  }
  const candidate = (result as { lastRunAt?: unknown }).lastRunAt;
  if (typeof candidate !== "string") {
    return null;
  }
  const parsed = new Date(candidate);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

interface PendingGroup {
  name: string;
  slug: string;
  rows: IncomingMatchFeedRow[];
  labelByUser: Map<string, string>;
}

export async function sendTradeMatchDigest(
  deps: TradeMatchDigestDeps,
): Promise<TradeMatchDigestResult> {
  const { repos, log, sendEmail, appBaseUrl, unsubscribeSecret, sinceTimestamp } = deps;

  if ((await repos.siteSettings.getBool(TRADE_MATCH_DIGEST_SETTING)) === false) {
    return { recipients: 0, emailsSent: 0, matches: 0, failed: 0, matchesDropped: 0 };
  }

  if (sinceTimestamp === null) {
    return { recipients: 0, emailsSent: 0, matches: 0, failed: 0, matchesDropped: 0 };
  }

  const recipients = await repos.userPreferences.listMatchDigestRecipients();
  let emailsSent = 0;
  let matchesSent = 0;
  let failed = 0;
  let matchesDropped = 0;

  for (const recipient of recipients) {
    const groups = await repos.friendGroups.listGroupsForUser(recipient.userId);
    const pending: PendingGroup[] = [];
    const cardIds = new Set<string>();

    for (const group of groups) {
      const rows = await repos.friendGroupMatches.recentIncomingMatchesForFeed({
        groupId: group.id,
        viewerUserId: recipient.userId,
        limit: DIGEST_MATCH_LIMIT,
        sinceTimestamp,
      });
      if (rows.length === 0) {
        continue;
      }
      for (const row of rows) {
        cardIds.add(row.cardId);
      }
      const members = await repos.friendGroups.listMembers(group.id);
      const labelByUser = new Map<string, string>();
      for (const member of members) {
        labelByUser.set(member.userId, member.userName ?? "A member");
      }
      pending.push({ name: group.name, slug: group.slug, rows, labelByUser });
    }

    if (pending.length === 0) {
      continue;
    }

    const cards = await repos.catalog.cardsByIds([...cardIds]);
    const nameByCard = new Map(cards.map((card) => [card.id, card.name]));

    const sections: DigestGroupSection[] = pending.map((group) => ({
      groupName: group.name,
      tradesUrl: `${appBaseUrl}/groups/${group.slug}/trades`,
      matches: group.rows.map((row) => ({
        cardName: nameByCard.get(row.cardId) ?? "a card",
        counterpartyLabel: group.labelByUser.get(row.counterpartyUserId) ?? "A member",
      })),
    }));

    const totalMatches = sections.reduce((sum, section) => sum + section.matches.length, 0);
    const { pageUrl, oneClickUrl } = buildUnsubscribeUrls(
      appBaseUrl,
      unsubscribeSecret,
      recipient.userId,
      "tradeMatches",
    );

    const { subject, html } = buildTradeMatchDigestEmail({
      recipientName: recipient.name,
      groups: sections,
      unsubscribeUrl: pageUrl,
    });

    try {
      await sendEmail({ to: recipient.email, subject, html, listUnsubscribeUrl: oneClickUrl });
      emailsSent += 1;
      matchesSent += totalMatches;
    } catch (error) {
      failed += 1;
      matchesDropped += totalMatches;
      log.error(
        { err: error, userId: recipient.userId },
        "Failed to send trade match digest to recipient",
      );
    }
  }

  return {
    recipients: recipients.length,
    emailsSent,
    matches: matchesSent,
    failed,
    matchesDropped,
  };
}
