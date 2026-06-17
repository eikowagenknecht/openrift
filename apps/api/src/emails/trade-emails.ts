import { emailButton, escapeHtml, renderEmailLayout } from "./layout.js";

/*
 * Builders for the two ADR-030 transactional emails. Pure: they take
 * already-resolved data plus pre-computed absolute URLs and return
 * `{ subject, html }`. URL construction, preference gating, and sending live in
 * the callers (the `createTrade` service and the digest cron).
 */

function quantityLabel(quantity: number, cardName: string): string {
  return quantity > 1 ? `${quantity}× ${cardName}` : cardName;
}

export interface TradeRequestEmailInput {
  /** Display name of the recipient (the non-initiator); may be null. */
  recipientName: string | null;
  /** Display name of the person who started the trade. */
  initiatorName: string | null;
  cardName: string;
  quantity: number;
  /** `wants` = receiver-initiated request, `offers` = giver-initiated offer. */
  kind: "wants" | "offers";
  /** Deep link to the group's Trades tab. */
  tradesUrl: string;
  /** One-click unsubscribe link for the `tradeRequests` channel. */
  unsubscribeUrl: string;
}

/**
 * Builds the instant "someone requested a trade" email.
 * @returns The subject line and full HTML body.
 */
export function buildTradeRequestEmail(input: TradeRequestEmailInput): {
  subject: string;
  html: string;
} {
  const initiator = input.initiatorName ?? "A group member";
  const card = quantityLabel(input.quantity, input.cardName);
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";

  const lead =
    input.kind === "wants"
      ? `<strong>${escapeHtml(initiator)}</strong> wants to trade for your <strong>${escapeHtml(card)}</strong>.`
      : `<strong>${escapeHtml(initiator)}</strong> is offering you <strong>${escapeHtml(card)}</strong>.`;

  const subject =
    input.kind === "wants"
      ? `${initiator} wants to trade for ${input.cardName} — OpenRift`
      : `${initiator} offers you ${input.cardName} — OpenRift`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 16px;">${lead}</p>
    <p style="margin:0 0 20px;">Open the trade to accept or decline it. Heads up: trade requests expire 24 hours after they're sent.</p>
    <p style="margin:0;">${emailButton("View the trade", input.tradesUrl)}</p>
  `;

  return {
    subject,
    html: renderEmailLayout({
      heading: "New trade request",
      bodyHtml,
      unsubscribe: { url: input.unsubscribeUrl, label: "Trade-request emails" },
    }),
  };
}

interface DigestMatch {
  cardName: string;
  /** Who has the card — counterparty nickname, then name, then a fallback. */
  counterpartyLabel: string;
}

export interface DigestGroupSection {
  groupName: string;
  /** Deep link to this group's Trades tab. */
  tradesUrl: string;
  matches: DigestMatch[];
}

export interface TradeMatchDigestEmailInput {
  recipientName: string | null;
  groups: DigestGroupSection[];
  /** One-click unsubscribe link for the `tradeMatches` channel. */
  unsubscribeUrl: string;
}

/**
 * Builds the daily "new matches in your groups" digest email.
 * @returns The subject line and full HTML body.
 */
export function buildTradeMatchDigestEmail(input: TradeMatchDigestEmailInput): {
  subject: string;
  html: string;
} {
  const totalMatches = input.groups.reduce((sum, group) => sum + group.matches.length, 0);
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";

  const groupBlocks = input.groups
    .map((group) => {
      const rows = group.matches
        .map(
          (match) =>
            `<li style="margin:0 0 4px;"><strong>${escapeHtml(match.cardName)}</strong> from ${escapeHtml(match.counterpartyLabel)}</li>`,
        )
        .join("");
      return `
        <div style="margin:0 0 20px;">
          <p style="margin:0 0 8px;font-weight:600;">${escapeHtml(group.groupName)}</p>
          <ul style="margin:0 0 10px;padding-left:18px;">${rows}</ul>
          <p style="margin:0;">${emailButton("Open trades", group.tradesUrl)}</p>
        </div>
      `;
    })
    .join("");

  const countLabel = totalMatches === 1 ? "1 new match" : `${totalMatches} new matches`;
  const subject = `${countLabel} in your trading groups — OpenRift`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 20px;">Members of your groups now have cards on your wishlist:</p>
    ${groupBlocks}
  `;

  return {
    subject,
    html: renderEmailLayout({
      heading: "New trade matches",
      bodyHtml,
      unsubscribe: { url: input.unsubscribeUrl, label: "Daily match digest" },
    }),
  };
}
