import type { Logger } from "@openrift/shared/logger";

import type { Repos } from "../deps.js";
import type { createEmailSender } from "../email.js";
import type { DigestGroupSection } from "../emails/trade-emails.js";
import { buildTradeMatchDigestEmail } from "../emails/trade-emails.js";
import { buildUnsubscribeUrls } from "../emails/unsubscribe-token.js";
import type { IncomingMatchFeedRow } from "../repositories/friend-group-matches.js";

type SendEmail = ReturnType<typeof createEmailSender>;

/** Generous per-(user, group) cap; friend groups are small, so this never binds. */
const DIGEST_MATCH_LIMIT = 500;

/**
 * Kill switch (ADR-030), an api-scoped site setting. Default on: absent (never
 * created) or `"true"` → send; set it to `"false"` to stop sending if a bug
 * shows up. Keep in sync with the admin site-settings page.
 */
export const TRADE_MATCH_DIGEST_SETTING = "trade-match-digest";

export interface TradeMatchDigestDeps {
  repos: Repos;
  log: Logger;
  sendEmail: SendEmail;
  /** Web origin for deep links + the unsubscribe route (BETTER_AUTH_URL). */
  appBaseUrl: string;
  /** App secret used to sign the stateless unsubscribe token. */
  unsubscribeSecret: string;
  /**
   * The watermark: only matches whose `matchedAt` is strictly after this are
   * sent. `null` on the very first run (no prior watermark) — nothing is sent,
   * which avoids a launch-day blast of every pre-existing match.
   */
  sinceTimestamp: Date | null;
}

export interface TradeMatchDigestResult {
  /** Opted-in, verified recipients considered. */
  recipients: number;
  /** Recipients actually emailed (had ≥1 new match and the send didn't throw). */
  emailsSent: number;
  /** Total new matches included across all sent emails. */
  matches: number;
  /** Recipient sends that threw. Without this a run where SMTP was down all day
   *  is indistinguishable from a quiet day with no new matches. */
  failed: number;
  /** Matches that were never delivered because their send threw. The watermark
   *  advances regardless (ADR-030), so these are dropped, not retried. */
  matchesDropped: number;
}

/** A match digest did nothing when no recipient was emailed and no match was
 *  included (flag off, first run, or nobody had new matches).
 *  @returns True when the run had no work to do. */
export function isTradeMatchDigestNoop(result: TradeMatchDigestResult): boolean {
  // `failed` needs no clause: a send can only fail for a recipient that was
  // considered, so any failure already shows up in `recipients`.
  return result.recipients === 0 && result.emailsSent === 0 && result.matches === 0;
}

/**
 * Reads the digest watermark from a prior run's stored `result`.
 * @returns The last run-start time as a Date, or `null` if there's no usable
 *   watermark (no prior run) — the caller treats this as the first run.
 */
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

/** A group's new matches plus the data needed to render them, before name resolution. */
interface PendingGroup {
  name: string;
  slug: string;
  rows: IncomingMatchFeedRow[];
  /** counterparty userId → display label (the member's name, or a fallback). */
  labelByUser: Map<string, string>;
}

/**
 * Sends the daily match digest (ADR-030): one email per opted-in, verified user
 * aggregating the cards that became available in their groups since the
 * watermark. Per-recipient sends are best-effort — a failure is logged, counted
 * in `failed`, and the run continues so one bad address can't sink the batch.
 * @returns Counts of recipients considered, emails sent and matches included,
 *   plus the failed sends and the matches dropped with them.
 */
export async function sendTradeMatchDigest(
  deps: TradeMatchDigestDeps,
): Promise<TradeMatchDigestResult> {
  const { repos, log, sendEmail, appBaseUrl, unsubscribeSecret, sinceTimestamp } = deps;

  // Kill switch (default on): skip the whole run if the setting is explicitly
  // off. The watermark still advances (the cron writes it), so the skipped
  // window's matches are dropped rather than queued — consistent with the
  // digest's watermark-only, best-effort design (a missed day is acceptable;
  // ADR-030).
  if ((await repos.siteSettings.getBool(TRADE_MATCH_DIGEST_SETTING)) === false) {
    return { recipients: 0, emailsSent: 0, matches: 0, failed: 0, matchesDropped: 0 };
  }

  // First run (no watermark) records `now()` and notifies nobody.
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
      // Resolve member display names only for groups with matches.
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

    // Resolve card names once for this recipient, then materialise the sections.
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
