import { emailButton, escapeHtml, MUTED_TEXT, renderEmailLayout } from "./layout.js";

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
  /** The initiator's revealed contact channels for this group, or `""` if none. */
  initiatorContact?: string;
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

  const contactLine = input.initiatorContact
    ? `<p style="margin:0 0 20px;">Reach ${escapeHtml(initiator)}: ${escapeHtml(input.initiatorContact)}</p>`
    : "";

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 16px;">${lead}</p>
    <p style="margin:0 0 20px;">Open the trade to accept or decline it. Heads up: trade requests expire 7 days after they're sent.</p>
    ${contactLine}
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

interface CoalescedRequest {
  cardName: string;
  quantity: number;
  /** `wants` = they want your card, `offers` = they're offering you one. */
  kind: "wants" | "offers";
}

export interface CoalescedRequestGroup {
  groupName: string;
  /** Deep link to this group's Trades tab. */
  tradesUrl: string;
  requests: CoalescedRequest[];
}

export interface CoalescedTradeRequestsEmailInput {
  /** Display name of the recipient (the non-initiator); may be null. */
  recipientName: string | null;
  /** Display name of the one member whose requests are coalesced here. */
  senderName: string | null;
  groups: CoalescedRequestGroup[];
  /** One-click unsubscribe link for the `tradeRequests` channel. */
  unsubscribeUrl: string;
}

/**
 * Builds the coalesced "{sender} sent you N trade requests" email, folding a
 * burst from a single member into one message (ADR-030).
 *
 * For any non-instant cadence (including the default `5min`) this is the
 * recipient's *first and only* notification of the burst — no instant email
 * precedes it — so the copy reads as a fresh first-contact notice, not a "you
 * have more waiting" follow-up. It stays accurate whether the burst is one
 * request or several, and whether or not an instant email happened to precede
 * it.
 * @returns The subject line and full HTML body.
 */
export function buildCoalescedTradeRequestsEmail(input: CoalescedTradeRequestsEmailInput): {
  subject: string;
  html: string;
} {
  const sender = input.senderName ?? "A group member";
  const senderHtml = escapeHtml(sender);
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";
  const total = input.groups.reduce((sum, group) => sum + group.requests.length, 0);

  // The sender is the actor; the group is only *where* the trade lives (it scopes
  // the deep link). Every line names the sender so each one stands on its own as
  // the player's action, never the group's. With a single shared group the group
  // name rides on the button; with several, a muted "In {group}" location line
  // separates the blocks.
  const multiGroup = input.groups.length > 1;

  const groupBlocks = input.groups
    .map((group) => {
      const rows = group.requests
        .map((request) => {
          const card = quantityLabel(request.quantity, request.cardName);
          const phrase =
            request.kind === "wants"
              ? `${senderHtml} wants your <strong>${escapeHtml(card)}</strong>`
              : `${senderHtml} offers you <strong>${escapeHtml(card)}</strong>`;
          return `<li style="margin:0 0 4px;">${phrase}</li>`;
        })
        .join("");
      const locationLine = multiGroup
        ? `<p style="margin:0 0 6px;color:${MUTED_TEXT};font-size:13px;">In ${escapeHtml(group.groupName)}</p>`
        : "";
      const buttonLabel = multiGroup ? "View the trades" : `View the trades in ${group.groupName}`;
      return `
        <div style="margin:0 0 20px;">
          ${locationLine}
          <ul style="margin:0 0 10px;padding-left:18px;">${rows}</ul>
          <p style="margin:0;">${emailButton(buttonLabel, group.tradesUrl)}</p>
        </div>
      `;
    })
    .join("");

  const countLabel = total === 1 ? "1 trade request" : `${total} trade requests`;
  const subject = `${sender} sent you ${countLabel} — OpenRift`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 20px;"><strong>${senderHtml}</strong> sent you some trade requests. Heads up: trade requests expire 7 days after they're sent.</p>
    ${groupBlocks}
  `;

  return {
    subject,
    html: renderEmailLayout({
      heading: "New trade requests",
      bodyHtml,
      unsubscribe: { url: input.unsubscribeUrl, label: "Trade-request emails" },
    }),
  };
}

/** A single status change folded into the coalesced status-update email. */
interface TradeStatusUpdate {
  cardName: string;
  quantity: number;
  /** `reserved` = accepted, `declined`, or `cancelled`. */
  event: "reserved" | "declined" | "cancelled";
}

export interface TradeStatusUpdateGroup {
  groupName: string;
  /** Deep link to this group's Trades tab. */
  tradesUrl: string;
  updates: TradeStatusUpdate[];
}

export interface TradeStatusUpdateEmailInput {
  /** Display name of the recipient (the party who didn't act); may be null. */
  recipientName: string | null;
  /** Display name of the member who made the change(s). */
  actorName: string | null;
  groups: TradeStatusUpdateGroup[];
  /** One-click unsubscribe link for the `tradeStatus` channel. */
  unsubscribeUrl: string;
}

/**
 * Phrase for one status line, e.g. "Garen accepted your request for 2× Card".
 * The actor is named on every line so each update reads as the player's action,
 * not the group's.
 * @returns The HTML phrase for the update's event.
 */
function statusUpdatePhrase(update: TradeStatusUpdate, actorHtml: string): string {
  const card = `<strong>${escapeHtml(quantityLabel(update.quantity, update.cardName))}</strong>`;
  switch (update.event) {
    case "reserved": {
      return `${actorHtml} accepted your request for ${card}`;
    }
    case "declined": {
      return `${actorHtml} declined your request for ${card}`;
    }
    case "cancelled": {
      return `${actorHtml} cancelled the trade for ${card}`;
    }
  }
}

/**
 * Builds the coalesced "{actor} updated your trades" email (ADR-030): folds one
 * member's accept/decline/cancel actions toward this recipient into a single
 * message, so accepting a basket of cards sends one email, not one per card.
 * @returns The subject line and full HTML body.
 */
export function buildTradeStatusUpdateEmail(input: TradeStatusUpdateEmailInput): {
  subject: string;
  html: string;
} {
  const actor = input.actorName ?? "A group member";
  const actorHtml = escapeHtml(actor);
  const greeting = input.recipientName ? `Hi ${escapeHtml(input.recipientName)},` : "Hi,";
  const total = input.groups.reduce((sum, group) => sum + group.updates.length, 0);

  // Same hierarchy as the request email: the actor leads every line, the group is
  // only the deep-link location — on the button for a single group, on a muted
  // "In {group}" line when several are involved.
  const multiGroup = input.groups.length > 1;

  const groupBlocks = input.groups
    .map((group) => {
      const rows = group.updates
        .map(
          (update) => `<li style="margin:0 0 4px;">${statusUpdatePhrase(update, actorHtml)}</li>`,
        )
        .join("");
      const locationLine = multiGroup
        ? `<p style="margin:0 0 6px;color:${MUTED_TEXT};font-size:13px;">In ${escapeHtml(group.groupName)}</p>`
        : "";
      const buttonLabel = multiGroup ? "View the trades" : `View the trades in ${group.groupName}`;
      return `
        <div style="margin:0 0 20px;">
          ${locationLine}
          <ul style="margin:0 0 10px;padding-left:18px;">${rows}</ul>
          <p style="margin:0;">${emailButton(buttonLabel, group.tradesUrl)}</p>
        </div>
      `;
    })
    .join("");

  const countLabel = total === 1 ? "a trade" : `${total} of your trades`;
  const subject = `${actor} updated ${countLabel} — OpenRift`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 20px;"><strong>${actorHtml}</strong> ${total === 1 ? "updated one of your trades:" : "updated some of your trades:"}</p>
    ${groupBlocks}
  `;

  return {
    subject,
    html: renderEmailLayout({
      heading: "Trade updates",
      bodyHtml,
      unsubscribe: { url: input.unsubscribeUrl, label: "Trade-status emails" },
    }),
  };
}

interface DigestMatch {
  cardName: string;
  /** Who has the card — the counterparty's display name, or a fallback. */
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
