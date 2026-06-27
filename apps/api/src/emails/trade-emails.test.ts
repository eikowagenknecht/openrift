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

  it("names the sender and counts the requests in the subject", () => {
    const { subject, html } = buildCoalescedTradeRequestsEmail(BASE);
    expect(subject).toBe("Garen sent you 2 trade requests — OpenRift");
    expect(html).toContain("New trade requests");
    expect(html).toContain("Garen</strong> sent you some trade requests");
    expect(html).not.toContain("more trade requests");
    expect(html).not.toContain("waiting for you");
    // The sender is named on every card line so each reads as the player's action.
    expect(html).toContain("Garen wants your <strong>Azir</strong>");
    expect(html).toContain("Garen offers you <strong>2× Lux</strong>");
    expect(html).toContain(BASE.groups[0].tradesUrl);
    expect(html).toContain(BASE.unsubscribeUrl);
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

  it("uses singular wording for a single request", () => {
    const { subject } = buildCoalescedTradeRequestsEmail({
      ...BASE,
      groups: [
        {
          groupName: "G",
          tradesUrl: "t",
          requests: [{ cardName: "C", quantity: 1, kind: "wants" }],
        },
      ],
    });
    expect(subject).toBe("Garen sent you 1 trade request — OpenRift");
  });

  it("falls back to a generic sender label when the name is null", () => {
    const { subject } = buildCoalescedTradeRequestsEmail({ ...BASE, senderName: null });
    expect(subject).toBe("A group member sent you 2 trade requests — OpenRift");
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

  it("names the actor and counts the updates in the subject", () => {
    const { subject, html } = buildTradeStatusUpdateEmail(BASE);
    expect(subject).toBe("Garen updated 3 of your trades — OpenRift");
    // Single shared group: rides on the button, not a standalone header.
    expect(html).toContain("View the trades in Playgroup");
    expect(html).not.toContain("In Playgroup");
    // The actor is named on every line so each update is clearly the player's.
    expect(html).toContain("Garen accepted your request for <strong>2× Azir</strong>");
    expect(html).toContain("Garen declined your request for <strong>Lux</strong>");
    expect(html).toContain("Garen cancelled the trade for <strong>Jinx</strong>");
    expect(html).toContain(BASE.groups[0].tradesUrl);
    expect(html).toContain(BASE.unsubscribeUrl);
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

  it("uses singular wording for a single update", () => {
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
    expect(subject).toBe("Garen updated a trade — OpenRift");
    expect(html).toContain("updated one of your trades");
  });

  it("falls back to a generic actor label when the name is null", () => {
    const { subject } = buildTradeStatusUpdateEmail({ ...BASE, actorName: null });
    expect(subject).toBe("A group member updated 3 of your trades — OpenRift");
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
  it("groups matches per group and counts them in the subject", () => {
    const { subject, html } = buildTradeMatchDigestEmail({
      recipientName: "Riven",
      unsubscribeUrl: "https://openrift.app/api/v1/unsubscribe?token=xyz",
      groups: [
        {
          groupName: "Playgroup",
          tradesUrl: "https://openrift.app/groups/playgroup/trades",
          matches: [
            { cardName: "Card A", counterpartyLabel: "Garen" },
            { cardName: "Card B", counterpartyLabel: "Lux" },
          ],
        },
      ],
    });
    expect(subject).toBe("2 new matches in your trading groups — OpenRift");
    expect(html).toContain("Playgroup");
    expect(html).toContain("Card A");
    expect(html).toContain("from Garen");
    expect(html).toContain("https://openrift.app/groups/playgroup/trades");
  });

  it("uses singular wording for a single match", () => {
    const { subject } = buildTradeMatchDigestEmail({
      recipientName: null,
      unsubscribeUrl: "u",
      groups: [
        { groupName: "G", tradesUrl: "t", matches: [{ cardName: "C", counterpartyLabel: "X" }] },
      ],
    });
    expect(subject).toBe("1 new match in your trading groups — OpenRift");
  });
});
