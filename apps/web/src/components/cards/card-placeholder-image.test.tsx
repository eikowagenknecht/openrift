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
        type="Unit"
        superTypes={["Champion"]}
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
});
