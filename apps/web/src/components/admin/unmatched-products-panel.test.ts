import { describe, expect, it } from "vitest";

import { buildAssignSuccessNavigation } from "./unmatched-products-panel";

describe("buildAssignSuccessNavigation", () => {
  it("uses the card slug, not the cardId, in route params", () => {
    // Regression: the panel previously passed the UUID as `cardSlug`, which
    // landed on a "No card data" error page because the route loader looks
    // up the card by slug.
    const nav = buildAssignSuccessNavigation(
      "cardtrader",
      { finish: "normal", language: "EN" },
      { cardSlug: "garen-might-of-demacia" },
    );

    expect(nav.params).toEqual({ cardSlug: "garen-might-of-demacia" });
    expect(nav.params.cardSlug).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("forwards marketplace, finish, and language to focus search params", () => {
    const nav = buildAssignSuccessNavigation(
      "tcgplayer",
      { finish: "foil", language: "JP" },
      { cardSlug: "any-card" },
    );

    expect(nav.to).toBe("/admin/cards/$cardSlug");
    expect(nav.search).toEqual({
      focusMarketplace: "tcgplayer",
      focusFinish: "foil",
      focusLanguage: "JP",
    });
  });
});
