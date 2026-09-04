import { describe, expect, it } from "vitest";

import { Route } from "./meta_.decks_.$token";

interface HeadMeta {
  title?: string;
  name?: string;
  property?: string;
  content?: string;
}
type HeadFn = (context: { loaderData: unknown; params: { token: string } }) => {
  meta: HeadMeta[];
  scripts: { children?: string }[];
};

const LEGEND_CARD = {
  cardId: "card-1",
  cardSlug: "blade-dancer",
  cardName: "Blade Dancer",
  cardTypes: ["legend"],
  superTypes: [],
  domains: ["calm", "chaos"],
  tags: ["Irelia"],
  zone: "legend",
  quantity: 1,
  preferredPrintingId: null,
};

function runHead(overrides: { cards?: unknown[]; playerName?: string } = {}) {
  const loaderData = {
    deck: {
      name: "Blade Dancer (adtoll)",
      format: "constructed",
      updatedAt: "2026-08-29T10:00:00.000Z",
    },
    cards: overrides.cards ?? [LEGEND_CARD],
    meta: {
      playerName: overrides.playerName ?? "adtoll",
      rank: 1,
      rankIsTier: false,
      event: { slug: "wuhan-open", name: "Wuhan Open", eventDate: "2026-08-29" },
    },
  };
  const head = Route.options.head as unknown as HeadFn;
  return head({ loaderData, params: { token: "PNID1X7995W0" } });
}

function title(meta: HeadMeta[]): string | undefined {
  return meta.find((entry) => entry.title !== undefined)?.title;
}

describe("/meta/decks/$token SSR head", () => {
  it("titles the page by the legend, never by the generated deck name", () => {
    const meta = runHead().meta;
    expect(title(meta)).toContain("Irelia, Blade Dancer, 1st at Wuhan Open");
    expect(title(meta)).not.toContain("Blade Dancer (adtoll)");
  });

  it("names the legend the player piloted in the description", () => {
    const description = runHead().meta.find((entry) => entry.name === "description")?.content;
    expect(description).toBe(
      "adtoll piloted Irelia, Blade Dancer to 1st at Wuhan Open (2026-08-29).",
    );
  });

  it("falls back to the player for a list whose source published no legend", () => {
    const meta = runHead({ cards: [] }).meta;
    expect(title(meta)).toContain("adtoll, 1st at Wuhan Open");
    expect(runHead({ cards: [] }).meta.find((entry) => entry.name === "description")?.content).toBe(
      "adtoll piloted this constructed deck to 1st at Wuhan Open (2026-08-29).",
    );
  });

  it("unfurls with the deck's own image rather than the site's", () => {
    const ogImage = runHead().meta.find((entry) => entry.property === "og:image")?.content;
    expect(ogImage).toContain("/decks/share/PNID1X7995W0/image.png");
  });

  it("ends the breadcrumb on the same name the title uses", () => {
    const crumbs = runHead().scripts[0]?.children ?? "";
    expect(crumbs).toContain("Irelia, Blade Dancer");
    expect(crumbs).not.toContain("Blade Dancer (adtoll)");
  });
});
