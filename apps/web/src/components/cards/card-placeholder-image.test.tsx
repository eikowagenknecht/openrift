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
    // CardThumbnail wraps the whole card in a <button>. If the placeholder
    // emits any <button> (e.g. a keyword chip from CardText), HTML5's parser
    // auto-closes the outer button in Firefox, ejecting the rest of the
    // thumbnail out of its grid cell.
    const { container } = render(
      <CardPlaceholderImage
        name="Swift Scout"
        domain={["COLORLESS"]}
        energy={2}
        might={3}
        power={1}
        type="unit"
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
    // Regression: the outer text wrapper used to be gated only on rulesText /
    // effectText / flavorText, so a card with only mightBonus had its "+N"
    // badge silently dropped from the placeholder.
    const { container } = render(
      <CardPlaceholderImage
        name="Pure Bonus"
        domain={["fury"]}
        energy={null}
        might={null}
        power={null}
        type="gear"
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

  it("omits the rarity glyph when no rarity is set", () => {
    // Regression: the contribute-form preview used to fall back to a "common"
    // glyph when rarity was unset, making it look like the user had picked
    // common when they hadn't.
    const { container } = render(
      <CardPlaceholderImage
        name="Unknown Rarity"
        domain={["fury"]}
        energy={1}
        might={null}
        power={null}
        type="spell"
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
    // Regression: glyphs in rules text used `size-4` (fixed 16px), so they
    // didn't scale when the card was rendered at a different font size (e.g.
    // the placeholder text-[3.5cqw]). Switched to `size-[1em]`.
    const { container } = render(
      <CardPlaceholderImage
        name="Energy Ant"
        domain={["fury"]}
        energy={1}
        might={null}
        power={null}
        type="spell"
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
