import { describe, expect, it } from "vitest";

import type { ChatCard, ChatEnumLabels } from "./chat-presenters.js";
import { chatCardLine, chatErrorLine, chatMissLine, chatUsageLine } from "./chat-presenters.js";

const SITE = "https://openrift.app";

const labels: ChatEnumLabels = {
  cardTypes: { unit: "Unit", spell: "Spell", battlefield: "Battlefield" },
  superTypes: { legend: "Legend", champion: "Champion" },
  domains: { fury: "Fury", mind: "Mind" },
};

function makeCard(overrides: Partial<ChatCard> = {}): ChatCard {
  return {
    slug: "viktor-herald-of-change",
    name: "Viktor, Herald of Change",
    superTypes: ["legend", "champion"],
    types: ["unit"],
    domains: ["fury", "mind"],
    tags: [],
    energy: 3,
    might: 4,
    power: 2,
    ...overrides,
  };
}

/** @returns The stat line between the name and the URL, which is what most cases assert. */
function statLine(card: ChatCard): string {
  return chatCardLine(card, labels).slice(`${card.name} — `.length);
}

describe("chatCardLine stat line", () => {
  it("orders super types, types, domains, then the stats", () => {
    expect(statLine(makeCard())).toBe(
      "Legend Champion Unit · Fury / Mind · Energy 3 · Might 4 · Power 2",
    );
  });

  it("omits stats the card does not have", () => {
    const card = makeCard({ superTypes: [], types: ["spell"], might: null, power: null });
    expect(statLine(card)).toBe("Spell · Fury / Mind · Energy 3");
  });

  it("keeps a zero stat, which is a real value", () => {
    expect(statLine(makeCard({ energy: 0, might: 0, power: 0 }))).toContain(
      "Energy 0 · Might 0 · Power 0",
    );
  });

  it("omits the domain segment for a card with no domains", () => {
    expect(statLine(makeCard({ domains: [] }))).toBe(
      "Legend Champion Unit · Energy 3 · Might 4 · Power 2",
    );
  });

  it("skips a slug the label map does not know rather than rendering undefined", () => {
    const card = makeCard({ types: ["unit", "mystery"], domains: ["fury", "mystery"] });
    const line = statLine(card);
    expect(line).not.toContain("undefined");
    expect(line).toBe("Legend Champion Unit · Fury · Energy 3 · Might 4 · Power 2");
  });
});

describe("chatCardLine", () => {
  it("puts the name, the stat line and the card URL on one line", () => {
    expect(chatCardLine(makeCard(), labels, SITE)).toBe(
      "Viktor, Herald of Change — Legend Champion Unit · Fury / Mind · Energy 3 · Might 4 · Power 2 — https://openrift.app/cards/viktor-herald-of-change",
    );
  });

  it("builds the URL from the given site origin, so preview links to itself", () => {
    expect(chatCardLine(makeCard(), labels, "https://preview.openrift.app")).toContain(
      "https://preview.openrift.app/cards/viktor-herald-of-change",
    );
  });

  it("drops the URL when the deployment has no configured origin", () => {
    const line = chatCardLine(makeCard(), labels);
    expect(line).not.toContain("http");
    expect(line).toContain("Viktor, Herald of Change — Legend Champion Unit");
  });

  it("emits just the name for a card with no describable fields", () => {
    const bare = makeCard({
      superTypes: [],
      types: [],
      domains: [],
      energy: null,
      might: null,
      power: null,
    });
    expect(chatCardLine(bare, labels, SITE)).toBe(
      "Viktor, Herald of Change — https://openrift.app/cards/viktor-herald-of-change",
    );
  });

  it("stays within the chat budget and keeps the URL intact when the name is absurd", () => {
    const line = chatCardLine(makeCard({ name: "N".repeat(300) }), labels, SITE);
    expect(line.length).toBeLessThanOrEqual(400);
    expect(line).toContain("https://openrift.app/cards/viktor-herald-of-change");
    expect(line).toContain("…");
  });

  it("stays within the chat budget when the stat line is absurd", () => {
    const card = makeCard({ types: Array.from({ length: 200 }, () => "unit") });
    const line = chatCardLine(card, labels, SITE);
    expect(line.length).toBeLessThanOrEqual(400);
    expect(line).toContain("https://openrift.app/cards/viktor-herald-of-change");
  });

  it("never emits a newline, which would split the chat message", () => {
    expect(chatCardLine(makeCard({ name: "Line\nBreak" }), labels, SITE)).not.toContain("\n");
  });
});

describe("chatMissLine", () => {
  it("names the query and links a pre-filled card search", () => {
    expect(chatMissLine("vicktor", SITE)).toBe(
      'No Riftbound card found for "vicktor". Try https://openrift.app/cards?search=vicktor',
    );
  });

  it("percent-encodes a query with spaces, so the link survives being pasted", () => {
    expect(chatMissLine("doran's shield", SITE)).toContain(
      `search=${encodeURIComponent("doran's shield")}`,
    );
  });

  it("escapes a query that tries to break out of the search param", () => {
    expect(chatMissLine("a&b=c", SITE)).toContain("search=a%26b%3Dc");
  });

  it("collapses whitespace so a pasted newline cannot split the message", () => {
    const line = chatMissLine("first\nsecond", SITE);
    expect(line).not.toContain("\n");
    expect(line).toContain('"first second"');
  });

  it("caps a pasted essay and stays within the chat budget", () => {
    const line = chatMissLine("q".repeat(500), SITE);
    expect(line.length).toBeLessThanOrEqual(400);
    expect(line).toContain("…");
  });

  it("drops the search link when the deployment has no configured origin", () => {
    expect(chatMissLine("vicktor")).toBe('No Riftbound card found for "vicktor".');
  });
});

describe("chatUsageLine", () => {
  it("explains the command and links the card browser", () => {
    expect(chatUsageLine(SITE)).toBe(
      'Look up a Riftbound card by name or code, e.g. "viktor" or "OGN-202". Browse every card at https://openrift.app/cards',
    );
  });

  it("drops the link when the deployment has no configured origin", () => {
    expect(chatUsageLine()).not.toContain("http");
  });
});

describe("chatErrorLine", () => {
  it("says the lookup failed rather than claiming the card does not exist", () => {
    const line = chatErrorLine(SITE);
    expect(line).toContain("temporarily unavailable");
    expect(line).not.toContain("No Riftbound card found");
  });

  it("drops the link when the deployment has no configured origin", () => {
    expect(chatErrorLine()).toBe("Card lookup is temporarily unavailable.");
  });
});
