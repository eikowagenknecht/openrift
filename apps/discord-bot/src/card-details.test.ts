import { describe, expect, it } from "vitest";

import {
  buildCardDetailsEmbed,
  detailsCustomId,
  detailsLabel,
  parseDetailsCustomId,
} from "./card-details.js";
import { buildSnapshot } from "./catalog-cache.js";
import {
  makeCard,
  makeCatalogResponse,
  makeInitResponse,
  makePricesResponse,
  makePrinting,
} from "./test/factories.js";

const SITE = "https://openrift.example";

function snapshotWith(card = makeCard(), printing = makePrinting()) {
  return buildSnapshot(
    makeCatalogResponse([card], [printing]),
    makePricesResponse(),
    makeInitResponse(),
  );
}

describe("detailsCustomId", () => {
  it("round-trips a card and printing id", () => {
    const id = detailsCustomId("019cfc3b-0389-744b-837c-792fd586300e", "019cfc3b-03d3-7dac-86c9");
    expect(parseDetailsCustomId(id)).toEqual({
      cardId: "019cfc3b-0389-744b-837c-792fd586300e",
      printingId: "019cfc3b-03d3-7dac-86c9",
    });
  });

  it("round-trips a card without a printing", () => {
    expect(parseDetailsCustomId(detailsCustomId("card-1"))).toEqual({
      cardId: "card-1",
      printingId: null,
    });
  });

  it("stays inside Discord's 100-character custom id limit for two UUIDs", () => {
    const uuid = "019cfc3b-0389-744b-837c-792fd586300e";
    expect(detailsCustomId(uuid, uuid).length).toBeLessThanOrEqual(100);
  });

  it("rejects custom ids belonging to other components", () => {
    expect(parseDetailsCustomId("something-else:card-1:")).toBeNull();
    expect(parseDetailsCustomId("card-details")).toBeNull();
    expect(parseDetailsCustomId("card-details::")).toBeNull();
    expect(parseDetailsCustomId("card-details:card-1:p-1:extra")).toBeNull();
  });
});

describe("detailsLabel", () => {
  it("is a bare label for a single-card reply", () => {
    expect(detailsLabel("Jinx, Rebel", false)).toBe("Details");
  });

  it("names the card when a reply carries several buttons", () => {
    expect(detailsLabel("Jinx, Rebel", true)).toBe("Details: Jinx, Rebel");
  });

  it("truncates a long card name to Discord's label limit", () => {
    const label = detailsLabel("A".repeat(120), true);
    expect(label).toHaveLength(80);
    expect(label.endsWith("…")).toBe(true);
  });
});

describe("buildCardDetailsEmbed", () => {
  it("carries the stat line and the card text the compact embed leaves off", () => {
    const snapshot = snapshotWith(
      makeCard(),
      makePrinting({ printedRulesText: "Draw 1.", printedEffectText: "I have +2 :rb_might:." }),
    );
    const embed = buildCardDetailsEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.title).toBe("Jinx, Rebel");
    expect(embed.url).toBe(`${SITE}/cards/jinx-rebel`);
    expect(embed.description).toBe("Champion Unit · Chaos · Energy 5 · Might 5");
    expect(embed.fields).toEqual([
      { name: "Rules text", value: "Draw 1." },
      { name: "Effect text", value: "I have +2 Might." },
    ]);
    expect(embed.footer?.text).toBe("OGN-202/298 · Origins");
    expect(embed.image).toBeUndefined();
  });

  it("gives the ban reason the compact embed only hints at", () => {
    const snapshot = snapshotWith(
      makeCard({
        bans: [
          { formatId: "f1", formatName: "Standard", bannedAt: "2026-01-05", reason: "Too fast" },
        ],
      }),
    );
    const embed = buildCardDetailsEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.fields).toEqual([{ name: "Ban", value: "**Standard** Too fast" }]);
  });

  it("lists every ban and copes with a missing reason", () => {
    const snapshot = snapshotWith(
      makeCard({
        bans: [
          { formatId: "f1", formatName: "Standard", bannedAt: "2026-01-05", reason: null },
          { formatId: "f2", formatName: "Ranked", bannedAt: "2026-02-01", reason: "Combo" },
        ],
      }),
    );
    const embed = buildCardDetailsEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.fields).toEqual([{ name: "Bans", value: "**Standard**\n**Ranked** Combo" }]);
  });

  it("renders glyphs with the app's emojis", () => {
    const snapshot = snapshotWith(
      makeCard(),
      makePrinting({ printedRulesText: "Pay :rb_energy_1:." }),
    );
    const embed = buildCardDetailsEmbed({
      card: snapshot.cards[0]!,
      printing: snapshot.printingsByCardId.get("card-1")![0],
      snapshot,
      emojis: new Map([["energy_1", "<:rb_energy_1:2>"]]),
      siteUrl: SITE,
    });
    expect(embed.fields?.[0]?.value).toBe("Pay <:rb_energy_1:2>.");
  });

  it("still describes the card when the printing is gone", () => {
    const snapshot = snapshotWith();
    const embed = buildCardDetailsEmbed({
      card: snapshot.cards[0]!,
      printing: undefined,
      snapshot,
      siteUrl: SITE,
    });
    expect(embed.description).toBe("Champion Unit · Chaos · Energy 5 · Might 5");
    expect(embed.fields).toBeUndefined();
    expect(embed.footer).toBeUndefined();
  });
});
