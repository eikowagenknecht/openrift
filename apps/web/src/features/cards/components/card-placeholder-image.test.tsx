import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { describe, expect, it } from "vitest";

import { CardPlaceholderImage } from "./card-placeholder-image";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(["init"], {
    enums: {
      cardTypes: [],
      rarities: [],
      domains: [],
      superTypes: [],
      finishes: [],
      artVariants: [],
      deckFormats: [],
      deckZones: [],
      languages: [],
    },
    keywords: {},
  });
  function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

describe("CardPlaceholderImage", () => {
  it("never emits <button> elements (so it can nest inside CardThumbnail's click target)", () => {
    // Firefox's HTML5 parser auto-closes an outer <button> around any nested
    // <button>, ejecting the rest of the thumbnail out of its grid cell.
    const { container } = render(
      <CardPlaceholderImage
        name="Swift Scout"
        domain={["COLORLESS"]}
        energy={2}
        might={3}
        power={1}
        types={["unit"]}
        superTypes={["champion"]}
        tags={["Yordle"]}
        rulesText="Pay :rb_energy_1: to hide a card with [Hidden] instead of :rb_rune_rainbow:."
        effectText="When played, draw 1 card [Haste]."
        mightBonus={2}
        flavorText="Fleet of foot."
        rarity="RARE"
        publicCode="OGN-263"
        artist="Shawn Lee"
      />,
      { wrapper: makeWrapper() },
    );

    expect(container.querySelectorAll("button")).toHaveLength(0);
  });

  it("renders the might-bonus badge when no rules / effect / flavor text is set", () => {
    const { container } = render(
      <CardPlaceholderImage
        name="Pure Bonus"
        domain={["fury"]}
        energy={null}
        might={null}
        power={null}
        types={["gear"]}
        superTypes={[]}
        tags={[]}
        rulesText={null}
        effectText={null}
        mightBonus={2}
        flavorText={null}
        rarity="common"
      />,
      { wrapper: makeWrapper() },
    );

    expect(container.textContent).toContain("+2");
  });

  it("renders one glyph per type and the gear cost diamond for multi-type cards (ADR-037)", () => {
    const { container } = render(
      <CardPlaceholderImage
        name="Hexcore Carrier"
        domain={["fury"]}
        energy={2}
        might={3}
        power={1}
        types={["unit", "gear"]}
        superTypes={[]}
        tags={[]}
        rulesText={null}
        effectText={null}
        mightBonus={null}
        flavorText={null}
      />,
      { wrapper: makeWrapper() },
    );

    // Type glyphs render as masked <span>s (GlyphIcon's arbitrary-tint branch).
    const glyphSpans = [...container.querySelectorAll("span")].filter((el) =>
      el.style.maskImage.includes("/images/types/"),
    );
    expect(glyphSpans.map((el) => el.style.maskImage)).toEqual([
      'url("/images/types/unit.svg")',
      'url("/images/types/gear.svg")',
    ]);
    const diamond = container.querySelector('[aria-label="Energy: 2"] .rotate-45');
    expect(diamond).not.toBeNull();
  });

  it("renders the promo label only when one is passed", () => {
    const props = {
      name: "Stamped Scout",
      domain: ["fury"],
      energy: 1,
      might: null,
      power: null,
      types: ["spell"],
      superTypes: [],
      tags: [],
      rulesText: null,
      effectText: null,
      mightBonus: null,
      flavorText: null,
      rarity: "common",
      publicCode: "OGN-001",
    };
    const withLabel = render(<CardPlaceholderImage {...props} promoLabel="Promo" />, {
      wrapper: makeWrapper(),
    });
    expect(withLabel.container.textContent).toContain("Promo");

    const withoutLabel = render(<CardPlaceholderImage {...props} name="Plain Scout" />, {
      wrapper: makeWrapper(),
    });
    expect(withoutLabel.container.textContent).not.toContain("Promo");
  });

  it("omits the rarity glyph when no rarity is set", () => {
    const { container } = render(
      <CardPlaceholderImage
        name="Unknown Rarity"
        domain={["fury"]}
        energy={1}
        might={null}
        power={null}
        types={["spell"]}
        superTypes={[]}
        tags={[]}
        rulesText={null}
        effectText={null}
        mightBonus={null}
        flavorText={null}
      />,
      { wrapper: makeWrapper() },
    );

    const rarityImg = container.querySelector('img[src*="/images/rarities/"]');
    expect(rarityImg).toBeNull();
  });

  it("renders inline rules-text glyphs with em-relative sizing so they scale with the card", () => {
    const { container } = render(
      <CardPlaceholderImage
        name="Energy Ant"
        domain={["fury"]}
        energy={1}
        might={null}
        power={null}
        types={["spell"]}
        superTypes={[]}
        tags={[]}
        rulesText="Pay :rb_energy_1: to draw."
        effectText={null}
        mightBonus={null}
        flavorText={null}
        rarity="common"
      />,
      { wrapper: makeWrapper() },
    );

    const energyBadge = container.querySelector('[aria-label="energy 1"]');
    expect(energyBadge?.className).toContain("size-[1.45em]");
  });
});
