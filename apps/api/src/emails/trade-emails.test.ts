import { describe, expect, it } from "vitest";

import {
  buildCoalescedTradeRequestsEmail,
  buildTradeMatchDigestEmail,
  buildTradeRequestEmail,
  buildTradeStatusUpdateEmail,
} from "./trade-emails.js";

const REQUEST_BASE = {
  recipientName: "Riven",
  initiatorName: "Garen",
  cardName: "Azir, Emperor of the Sands",
  quantity: 1,
  tradesUrl: "https://openrift.app/groups/my-group/trades",
  unsubscribeUrl: "https://openrift.app/api/v1/unsubscribe?token=abc",
} as const;

describe("buildTradeRequestEmail", () => {
  it("phrases a receiver-initiated request as 'wants'", () => {
    const { subject, html } = buildTradeRequestEmail({ ...REQUEST_BASE, kind: "wants" });
    expect(subject).toBe("Garen wants to trade for Azir, Emperor of the Sands — OpenRift");
    expect(html).toContain("wants to trade for");
    expect(html).toContain("Garen");
    expect(html).toContain("expire 7 days");
    expect(html).toContain(REQUEST_BASE.tradesUrl);
    expect(html).toContain(REQUEST_BASE.unsubscribeUrl);
  });

  it("phrases a giver-initiated offer as 'offers'", () => {
    const { subject, html } = buildTradeRequestEmail({ ...REQUEST_BASE, kind: "offers" });
    expect(subject).toBe("Garen offers you Azir, Emperor of the Sands — OpenRift");
    expect(html).toContain("offering you");
  });

  it("includes the quantity when more than one is requested", () => {
    const { html } = buildTradeRequestEmail({ ...REQUEST_BASE, quantity: 3, kind: "wants" });
    expect(html).toContain("3× Azir, Emperor of the Sands");
  });

  it("escapes HTML in user-controlled fields", () => {
    const { html } = buildTradeRequestEmail({
      ...REQUEST_BASE,
      initiatorName: "<script>alert(1)</script>",
      kind: "wants",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders a 'Reach …' line when the initiator shared a contact", () => {
    const { html } = buildTradeRequestEmail({
      ...REQUEST_BASE,
      kind: "wants",
      initiatorContact: "Discord: seb#1234",
    });
    expect(html).toContain("Reach Garen: Discord: seb#1234");
  });

  it("omits the contact line when no contact was shared", () => {
    const { html } = buildTradeRequestEmail({ ...REQUEST_BASE, kind: "wants" });
    expect(html).not.toContain("Reach ");
  });
});

describe("buildCoalescedTradeRequestsEmail", () => {
  const BASE = {
    recipientName: "Riven",
    senderName: "Garen",
    unsubscribeUrl: "https://openrift.app/api/v1/unsubscribe?token=abc",
    groups: [
      {
        groupName: "Playgroup",
        tradesUrl: "https://openrift.app/groups/playgroup/trades",
        requests: [
          { cardName: "Azir", quantity: 1, kind: "wants" as const },
          { cardName: "Lux", quantity: 2, kind: "offers" as const },
        ],
      },
    ],
  };

  it("counts each direction in the subject and groups the body by direction", () => {
    const { subject, html } = buildCoalescedTradeRequestsEmail(BASE);
    expect(subject).toBe("Garen wants 1 of your cards and offers you 1 — OpenRift");
    expect(html).toContain("New trade requests");
    expect(html).toContain("Garen</strong> sent you 2 trade requests");
    expect(html).not.toContain("more trade requests");
    expect(html).not.toContain("waiting for you");
    // The intro names the sender once; the lines are grouped under direction
    // headers and carry only the card.
    expect(html).toContain(">Wants from you</p>");
    expect(html).toContain(">Offers you</p>");
    expect(html).toContain("<strong>Azir</strong>");
    expect(html).toContain("<strong>2× Lux</strong>");
    expect(html).not.toContain("Garen wants your");
    expect(html).toContain(BASE.groups[0].tradesUrl);
    expect(html).toContain(BASE.unsubscribeUrl);
  });

  it("omits direction sections that have no requests", () => {
    const { subject, html } = buildCoalescedTradeRequestsEmail({
      ...BASE,
      groups: [
        {
          groupName: "Playgroup",
          tradesUrl: "https://openrift.app/groups/playgroup/trades",
          requests: [
            { cardName: "Azir", quantity: 1, kind: "offers" },
            { cardName: "Lux", quantity: 2, kind: "offers" },
          ],
        },
      ],
    });
    expect(subject).toBe("Garen offers you 2 cards — OpenRift");
    expect(html).toContain(">Offers you</p>");
    expect(html).not.toContain(">Wants from you</p>");
  });

  it("keeps the sender the subject: a single shared group rides on the button, not a header", () => {
    const { html } = buildCoalescedTradeRequestsEmail(BASE);
    // The group lives on the CTA so the player stays the actor of each line; it
    // is never rendered as a standalone "In {group}" location line.
    expect(html).toContain("View the trades in Playgroup");
    expect(html).not.toContain("In Playgroup");
  });

  it("labels each block with a muted location line when several groups are involved", () => {
    const { html } = buildCoalescedTradeRequestsEmail({
      ...BASE,
      groups: [
        {
          groupName: "Playgroup",
          tradesUrl: "https://openrift.app/groups/playgroup/trades",
          requests: [{ cardName: "Azir", quantity: 1, kind: "wants" }],
        },
        {
          groupName: "LGS Night",
          tradesUrl: "https://openrift.app/groups/lgs-night/trades",
          requests: [{ cardName: "Jinx", quantity: 1, kind: "offers" }],
        },
      ],
    });
    expect(html).toContain("In Playgroup");
    expect(html).toContain("In LGS Night");
    // The group name moves into the location line, so the button stays generic.
    expect(html).toContain("View the trades<");
    expect(html).not.toContain("View the trades in");
  });

  it("keeps the instant email's sentence form for a single request", () => {
    const { subject, html } = buildCoalescedTradeRequestsEmail({
      ...BASE,
      groups: [
        {
          groupName: "G",
          tradesUrl: "t",
          requests: [{ cardName: "C", quantity: 1, kind: "wants" }],
        },
      ],
    });
    expect(subject).toBe("Garen wants to trade for C — OpenRift");
    expect(html).toContain("New trade request");
    expect(html).toContain("Garen</strong> wants to trade for your <strong>C</strong>.");
    // No direction header over a single card.
    expect(html).not.toContain(">Wants from you</p>");
    expect(html).toContain("expire 7 days");
    expect(html).toContain("View the trades in G");
  });

  it("falls back to a generic sender label when the name is null", () => {
    const { subject } = buildCoalescedTradeRequestsEmail({ ...BASE, senderName: null });
    expect(subject).toBe("A group member wants 1 of your cards and offers you 1 — OpenRift");
  });

  it("escapes HTML in user-controlled fields", () => {
    const { html } = buildCoalescedTradeRequestsEmail({
      ...BASE,
      senderName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildTradeStatusUpdateEmail", () => {
  const BASE = {
    recipientName: "Riven",
    actorName: "Garen",
    unsubscribeUrl: "https://openrift.app/api/v1/unsubscribe?token=abc",
    groups: [
      {
        groupName: "Playgroup",
        tradesUrl: "https://openrift.app/groups/playgroup/trades",
        updates: [
          { cardName: "Azir", quantity: 2, event: "reserved" as const },
          { cardName: "Lux", quantity: 1, event: "declined" as const },
          { cardName: "Jinx", quantity: 1, event: "cancelled" as const },
        ],
      },
    ],
  };

  it("counts each verdict in the subject and groups the body by outcome", () => {
    const { subject, html } = buildTradeStatusUpdateEmail(BASE);
    expect(subject).toBe("Garen accepted 1, declined 1, and cancelled 1 of your trades — OpenRift");
    // Single shared group: rides on the button, not a standalone header.
    expect(html).toContain("View the trades in Playgroup");
    expect(html).not.toContain("In Playgroup");
    // The intro names the actor once; the lines are grouped under verdict
    // headers and carry only the card.
    expect(html).toContain("Garen</strong> updated some of your trades");
    expect(html).toContain(">Accepted</p>");
    expect(html).toContain(">Declined</p>");
    expect(html).toContain(">Cancelled</p>");
    expect(html).toContain("<strong>2× Azir</strong>");
    expect(html).toContain("<strong>Lux</strong>");
    expect(html).toContain("<strong>Jinx</strong>");
    expect(html).not.toContain("Garen accepted your request");
    expect(html).toContain(BASE.groups[0].tradesUrl);
    expect(html).toContain(BASE.unsubscribeUrl);
  });

  it("orders the outcome sections accepted, declined, cancelled", () => {
    const { html } = buildTradeStatusUpdateEmail(BASE);
    const accepted = html.indexOf(">Accepted</p>");
    const declined = html.indexOf(">Declined</p>");
    const cancelled = html.indexOf(">Cancelled</p>");
    expect(accepted).toBeGreaterThan(-1);
    expect(accepted).toBeLessThan(declined);
    expect(declined).toBeLessThan(cancelled);
  });

  it("omits outcome sections that have no updates", () => {
    const { subject, html } = buildTradeStatusUpdateEmail({
      ...BASE,
      groups: [
        {
          groupName: "Playgroup",
          tradesUrl: "https://openrift.app/groups/playgroup/trades",
          updates: [
            { cardName: "Azir", quantity: 2, event: "reserved" },
            { cardName: "Lux", quantity: 1, event: "reserved" },
          ],
        },
      ],
    });
    expect(subject).toBe("Garen accepted 2 of your trades — OpenRift");
    expect(html).toContain(">Accepted</p>");
    expect(html).not.toContain(">Declined</p>");
    expect(html).not.toContain(">Cancelled</p>");
  });

  it("labels each block with a muted location line when several groups are involved", () => {
    const { html } = buildTradeStatusUpdateEmail({
      ...BASE,
      groups: [
        {
          groupName: "Playgroup",
          tradesUrl: "https://openrift.app/groups/playgroup/trades",
          updates: [{ cardName: "Azir", quantity: 1, event: "reserved" }],
        },
        {
          groupName: "LGS Night",
          tradesUrl: "https://openrift.app/groups/lgs-night/trades",
          updates: [{ cardName: "Jinx", quantity: 1, event: "cancelled" }],
        },
      ],
    });
    expect(html).toContain("In Playgroup");
    expect(html).toContain("In LGS Night");
    expect(html).toContain("View the trades<");
    expect(html).not.toContain("View the trades in");
  });

  it("keeps the plain-sentence form for a single update", () => {
    const { subject, html } = buildTradeStatusUpdateEmail({
      ...BASE,
      groups: [
        {
          groupName: "G",
          tradesUrl: "t",
          updates: [{ cardName: "C", quantity: 1, event: "reserved" }],
        },
      ],
    });
    expect(subject).toBe("Garen accepted your trade request — OpenRift");
    expect(html).toContain("Garen</strong> accepted your request for <strong>C</strong>.");
    // No verdict header over a single bullet.
    expect(html).not.toContain(">Accepted</p>");
    expect(html).toContain("View the trades in G");
  });

  it("phrases a single cancellation as a cancellation", () => {
    const { subject, html } = buildTradeStatusUpdateEmail({
      ...BASE,
      groups: [
        {
          groupName: "G",
          tradesUrl: "t",
          updates: [{ cardName: "C", quantity: 1, event: "cancelled" }],
        },
      ],
    });
    expect(subject).toBe("Garen cancelled a trade — OpenRift");
    expect(html).toContain("Garen</strong> cancelled the trade for <strong>C</strong>.");
  });

  it("falls back to a generic actor label when the name is null", () => {
    const { subject } = buildTradeStatusUpdateEmail({ ...BASE, actorName: null });
    expect(subject).toBe(
      "A group member accepted 1, declined 1, and cancelled 1 of your trades — OpenRift",
    );
  });

  it("escapes HTML in user-controlled fields", () => {
    const { html } = buildTradeStatusUpdateEmail({
      ...BASE,
      actorName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("buildTradeMatchDigestEmail", () => {
  it("groups matches by counterparty and counts them in the subject", () => {
    const { subject, html } = buildTradeMatchDigestEmail({
      recipientName: "Riven",
      unsubscribeUrl: "https://openrift.app/api/v1/unsubscribe?token=xyz",
      groups: [
        {
          groupName: "Playgroup",
          tradesUrl: "https://openrift.app/groups/playgroup/trades",
          matches: [
            { cardName: "Card A", counterpartyLabel: "Garen" },
            { cardName: "Card B", counterpartyLabel: "Garen" },
            { cardName: "Card C", counterpartyLabel: "Lux" },
          ],
        },
      ],
    });
    expect(subject).toBe("3 new matches in your trading groups — OpenRift");
    // One "X has" header per counterparty, cards listed beneath it.
    expect(html).toContain(">Garen has</p>");
    expect(html).toContain(">Lux has</p>");
    expect(html).toContain("<strong>Card A</strong>");
    expect(html).toContain("<strong>Card B</strong>");
    expect(html).not.toContain("from Garen");
    // Single shared group: rides on the button, not a standalone header.
    expect(html).toContain("View the trades in Playgroup");
    expect(html).not.toContain("In Playgroup");
    expect(html).toContain("https://openrift.app/groups/playgroup/trades");
  });

  it("labels each block with a muted location line when several groups are involved", () => {
    const { html } = buildTradeMatchDigestEmail({
      recipientName: "Riven",
      unsubscribeUrl: "u",
      groups: [
        {
          groupName: "Playgroup",
          tradesUrl: "t1",
          matches: [
            { cardName: "Card A", counterpartyLabel: "Garen" },
            { cardName: "Card B", counterpartyLabel: "Lux" },
          ],
        },
        {
          groupName: "LGS Night",
          tradesUrl: "t2",
          matches: [{ cardName: "Card C", counterpartyLabel: "Jinx" }],
        },
      ],
    });
    expect(html).toContain("In Playgroup");
    expect(html).toContain("In LGS Night");
    expect(html).toContain("View the trades<");
    expect(html).not.toContain("View the trades in");
  });

  it("keeps the plain-sentence form for a single match", () => {
    const { subject, html } = buildTradeMatchDigestEmail({
      recipientName: null,
      unsubscribeUrl: "u",
      groups: [
        { groupName: "G", tradesUrl: "t", matches: [{ cardName: "C", counterpartyLabel: "X" }] },
      ],
    });
    expect(subject).toBe("1 new match in your trading groups — OpenRift");
    expect(html).toContain("X</strong> now has <strong>C</strong> from your wishlist.");
    expect(html).not.toContain(">X has</p>");
    expect(html).toContain("View the trades in G");
  });
});
