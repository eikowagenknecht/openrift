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

/**
 * Lead sentence for a single trade request, e.g.
 * "Garen wants to trade for your 2× Card." — shared by the instant email and
 * the coalesced email's single-request form.
 * @returns The HTML sentence for the request's kind.
 */
function requestLead(senderHtml: string, card: string, kind: "wants" | "offers"): string {
  const cardHtml = `<strong>${escapeHtml(card)}</strong>`;
  return kind === "wants"
    ? `${senderHtml} wants to trade for your ${cardHtml}.`
    : `${senderHtml} is offering you ${cardHtml}.`;
}

/**
 * Subject for a single trade request, matching the lead sentence's phrasing.
 * @returns The subject line (without the "— OpenRift" suffix).
 */
function requestSubject(sender: string, cardName: string, kind: "wants" | "offers"): string {
  return kind === "wants"
    ? `${sender} wants to trade for ${cardName}`
    : `${sender} offers you ${cardName}`;
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

  const lead = requestLead(`<strong>${escapeHtml(initiator)}</strong>`, card, input.kind);
  const subject = `${requestSubject(initiator, input.cardName, input.kind)} — OpenRift`;

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

/** Per-direction presentation for the coalesced request email, in display order. */
const REQUEST_KINDS = [
  { kind: "wants", heading: "Wants from you" },
  { kind: "offers", heading: "Offers you" },
] as const;

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
  const allRequests = input.groups.flatMap((group) => group.requests);
  const total = allRequests.length;

  // The email is coalesced per sender, so the intro names the sender once and
  // the lines group by direction ("Wants from you" / "Offers you") — only the
  // cards vary, so that's all a line shows. No verdict colors here: neither
  // direction is good or bad news. The group stays the deep-link location: on
  // the button for a single group, on a muted "In {group}" line when several
  // are involved. A single request keeps the instant email's sentence form.
  if (total === 1) {
    const group = input.groups[0];
    const request = group.requests[0];
    const card = quantityLabel(request.quantity, request.cardName);
    const bodyHtml = `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 16px;">${requestLead(`<strong>${senderHtml}</strong>`, card, request.kind)}</p>
      <p style="margin:0 0 20px;">Open the trade to accept or decline it. Heads up: trade requests expire 7 days after they're sent.</p>
      <p style="margin:0;">${emailButton(`View the trades in ${group.groupName}`, group.tradesUrl)}</p>
    `;
    return {
      subject: `${requestSubject(sender, request.cardName, request.kind)} — OpenRift`,
      html: renderEmailLayout({
        heading: "New trade request",
        bodyHtml,
        unsubscribe: { url: input.unsubscribeUrl, label: "Trade-request emails" },
      }),
    };
  }

  const multiGroup = input.groups.length > 1;

  const groupBlocks = input.groups
    .map((group) => {
      const sections = REQUEST_KINDS.map(({ kind, heading }) => {
        const cards = group.requests.filter((request) => request.kind === kind);
        if (cards.length === 0) {
          return "";
        }
        const rows = cards
          .map(
            (request) =>
              `<li style="margin:0 0 4px;"><strong>${escapeHtml(quantityLabel(request.quantity, request.cardName))}</strong></li>`,
          )
          .join("");
        return `
          <p style="margin:0 0 4px;font-weight:600;">${heading}</p>
          <ul style="margin:0 0 12px;padding-left:18px;">${rows}</ul>
        `;
      }).join("");
      const locationLine = multiGroup
        ? `<p style="margin:0 0 6px;color:${MUTED_TEXT};font-size:13px;">In ${escapeHtml(group.groupName)}</p>`
        : "";
      const buttonLabel = multiGroup ? "View the trades" : `View the trades in ${group.groupName}`;
      return `
        <div style="margin:0 0 20px;">
          ${locationLine}
          ${sections}
          <p style="margin:0;">${emailButton(buttonLabel, group.tradesUrl)}</p>
        </div>
      `;
    })
    .join("");

  // "wants 2 of your cards and offers you 1" — the directions tell the story
  // from the notification tray, before the email is opened.
  const wantsCount = allRequests.filter((request) => request.kind === "wants").length;
  const offersCount = total - wantsCount;
  const parts: string[] = [];
  if (wantsCount > 0) {
    parts.push(`wants ${wantsCount} of your cards`);
  }
  if (offersCount > 0) {
    // With a wants part ahead, "cards" is already established: "…and offers you 1".
    parts.push(wantsCount > 0 ? `offers you ${offersCount}` : `offers you ${offersCount} cards`);
  }
  const subject = `${sender} ${joinWithAnd(parts)} — OpenRift`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 20px;"><strong>${senderHtml}</strong> sent you ${total} trade requests. Heads up: trade requests expire 7 days after they're sent.</p>
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
 * Per-outcome presentation for the status-update email, in display order:
 * good news first, then declines, then cancellations.
 */
const STATUS_OUTCOMES = [
  { event: "reserved", verb: "accepted", heading: "Accepted", color: "#15803d" },
  { event: "declined", verb: "declined", heading: "Declined", color: "#b91c1c" },
  { event: "cancelled", verb: "cancelled", heading: "Cancelled", color: MUTED_TEXT },
] as const;

/**
 * Joins parts into an English enumeration ("a", "a and b", "a, b, and c").
 * @returns The joined phrase.
 */
function joinWithAnd(parts: string[]): string {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  if (parts.length === 2) {
    return `${parts[0]} and ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

/**
 * Sentence for the single-update email, e.g.
 * "Garen accepted your request for 2× Card".
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
 * Subject for the single-update email, matching the body's sentence phrasing.
 * @returns The subject line (without the "— OpenRift" suffix).
 */
function singleUpdateSubject(actor: string, event: TradeStatusUpdate["event"]): string {
  switch (event) {
    case "reserved": {
      return `${actor} accepted your trade request`;
    }
    case "declined": {
      return `${actor} declined your trade request`;
    }
    case "cancelled": {
      return `${actor} cancelled a trade`;
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
  const allUpdates = input.groups.flatMap((group) => group.updates);
  const total = allUpdates.length;

  // The email is coalesced per actor, so the actor is constant and the intro
  // carries it once. The lines themselves group by outcome under colored
  // headers — the verdict and the card are the only things that vary, so they
  // are all a line shows. The group stays the deep-link location: on the button
  // for a single group, on a muted "In {group}" line when several are involved.
  // A single update keeps the plain-sentence form; a header over one bullet
  // reads as noise.
  if (total === 1) {
    const group = input.groups[0];
    const bodyHtml = `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 20px;">${statusUpdatePhrase(group.updates[0], `<strong>${actorHtml}</strong>`)}.</p>
      <p style="margin:0;">${emailButton(`View the trades in ${group.groupName}`, group.tradesUrl)}</p>
    `;
    return {
      subject: `${singleUpdateSubject(actor, group.updates[0].event)} — OpenRift`,
      html: renderEmailLayout({
        heading: "Trade updates",
        bodyHtml,
        unsubscribe: { url: input.unsubscribeUrl, label: "Trade-status emails" },
      }),
    };
  }

  const multiGroup = input.groups.length > 1;

  const groupBlocks = input.groups
    .map((group) => {
      const sections = STATUS_OUTCOMES.map(({ event, heading, color }) => {
        const cards = group.updates.filter((update) => update.event === event);
        if (cards.length === 0) {
          return "";
        }
        const rows = cards
          .map(
            (update) =>
              `<li style="margin:0 0 4px;"><strong>${escapeHtml(quantityLabel(update.quantity, update.cardName))}</strong></li>`,
          )
          .join("");
        return `
          <p style="margin:0 0 4px;font-weight:600;color:${color};">${heading}</p>
          <ul style="margin:0 0 12px;padding-left:18px;">${rows}</ul>
        `;
      }).join("");
      const locationLine = multiGroup
        ? `<p style="margin:0 0 6px;color:${MUTED_TEXT};font-size:13px;">In ${escapeHtml(group.groupName)}</p>`
        : "";
      const buttonLabel = multiGroup ? "View the trades" : `View the trades in ${group.groupName}`;
      return `
        <div style="margin:0 0 20px;">
          ${locationLine}
          ${sections}
          <p style="margin:0;">${emailButton(buttonLabel, group.tradesUrl)}</p>
        </div>
      `;
    })
    .join("");

  // "accepted 2 and declined 1" — the verdict counts tell the story from the
  // notification tray, before the email is opened.
  const countPhrase = joinWithAnd(
    STATUS_OUTCOMES.map(({ event, verb }) => ({
      verb,
      count: allUpdates.filter((update) => update.event === event).length,
    }))
      .filter(({ count }) => count > 0)
      .map(({ verb, count }) => `${verb} ${count}`),
  );
  const subject = `${actor} ${countPhrase} of your trades — OpenRift`;

  const bodyHtml = `
    <p style="margin:0 0 12px;">${greeting}</p>
    <p style="margin:0 0 20px;"><strong>${actorHtml}</strong> updated some of your trades:</p>
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

  const countLabel = totalMatches === 1 ? "1 new match" : `${totalMatches} new matches`;
  const subject = `${countLabel} in your trading groups — OpenRift`;

  // Matches group by counterparty ("Garen has …"), not card by card — the
  // person is the call to action, the cards are the detail. The group is the
  // deep-link location, same as the other trade emails: on the button for a
  // single group, on a muted "In {group}" line when several are involved. A
  // single match keeps the plain-sentence form.
  if (totalMatches === 1) {
    const group = input.groups[0];
    const match = group.matches[0];
    const bodyHtml = `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0 0 20px;"><strong>${escapeHtml(match.counterpartyLabel)}</strong> now has <strong>${escapeHtml(match.cardName)}</strong> from your wishlist.</p>
      <p style="margin:0;">${emailButton(`View the trades in ${group.groupName}`, group.tradesUrl)}</p>
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

  const multiGroup = input.groups.length > 1;

  const groupBlocks = input.groups
    .map((group) => {
      const byCounterparty = Map.groupBy(group.matches, (match) => match.counterpartyLabel);
      const sections = [...byCounterparty.entries()]
        .map(([counterpartyLabel, matches]) => {
          const rows = matches
            .map(
              (match) =>
                `<li style="margin:0 0 4px;"><strong>${escapeHtml(match.cardName)}</strong></li>`,
            )
            .join("");
          return `
            <p style="margin:0 0 4px;font-weight:600;">${escapeHtml(counterpartyLabel)} has</p>
            <ul style="margin:0 0 12px;padding-left:18px;">${rows}</ul>
          `;
        })
        .join("");
      const locationLine = multiGroup
        ? `<p style="margin:0 0 6px;color:${MUTED_TEXT};font-size:13px;">In ${escapeHtml(group.groupName)}</p>`
        : "";
      const buttonLabel = multiGroup ? "View the trades" : `View the trades in ${group.groupName}`;
      return `
        <div style="margin:0 0 20px;">
          ${locationLine}
          ${sections}
          <p style="margin:0;">${emailButton(buttonLabel, group.tradesUrl)}</p>
        </div>
      `;
    })
    .join("");

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
