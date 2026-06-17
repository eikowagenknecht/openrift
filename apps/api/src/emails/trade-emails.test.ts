import { describe, expect, it } from "vitest";

import { buildTradeMatchDigestEmail, buildTradeRequestEmail } from "./trade-emails.js";

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
    expect(html).toContain("expire 24 hours");
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
