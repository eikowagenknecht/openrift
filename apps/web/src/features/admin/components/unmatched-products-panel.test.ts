import { describe, expect, it } from "vitest";

import { buildAssignSuccessNavigation } from "./unmatched-products-panel";

describe("buildAssignSuccessNavigation", () => {
  it("uses the card slug, not the cardId, in route params", () => {
    const nav = buildAssignSuccessNavigation(
      "cardtrader",
      { finish: "normal", language: "EN" },
      { cardSlug: "garen-might-of-demacia" },
    );

    expect(nav.params).toEqual({ cardSlug: "garen-might-of-demacia" });
    expect(nav.params.cardSlug).not.toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu,
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
