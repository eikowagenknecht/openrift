import type * as SharedAvailable from "@openrift/shared/filters-available";
import type { CardFilters } from "@openrift/shared/types/search";
import { EMPTY_CARD_FILTERS } from "@openrift/shared/types/search";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A fixed facet set so only Markers and Custom Tags are offered, to prove
// presence folding without dragging in the whole catalog.
const AVAILABLE = {
  hasNonStandard: true,
  types: [],
  superTypes: [],
  domains: [],
  keywords: [],
  tags: [],
  hasBanned: false,
  sets: [],
  rarities: [],
  finishes: [],
  artVariants: [],
  markers: [{ slug: "promo", label: "Promo" }],
  distributionChannels: [],
  hasSigned: false,
};

vi.mock("@openrift/shared/filters-available", async (importOriginal) => {
  const actual = await importOriginal<typeof SharedAvailable>();
  return { ...actual, getAvailableFilters: () => AVAILABLE };
});

// The price row's skipped-count pass runs the real `filterCards` over these.
const printing = (id: string, language: string) => ({
  id,
  cardId: `card-${id}`,
  shortCode: id,
  setId: "set-1",
  setSlug: "origins",
  setReleased: true,
  rarity: "common",
  artVariant: "normal",
  isSigned: false,
  markers: [],
  distributionChannels: [],
  finish: "normal",
  size: "standard",
  images: [],
  artist: "Artist",
  publicCode: "PUB",
  printedRulesText: null,
  printedEffectText: null,
  flavorText: null,
  printedName: null,
  printedYear: null,
  comment: null,
  language,
  canonicalRank: 0,
  card: {
    slug: `card-${id}`,
    name: `Card ${id}`,
    type: "unit",
    types: ["unit"],
    superTypes: [],
    domains: ["fury"],
    energy: 1,
    might: 1,
    power: 1,
    keywords: [],
    tags: [],
    mightBonus: 0,
    maxCopiesOverride: null,
    errata: null,
    bans: [],
  },
});

vi.mock("@/features/cards/hooks/use-cards", () => ({
  useCards: () => ({
    allPrintings: [printing("p1", "en"), printing("p2", "de")],
    sets: [{ slug: "origins", name: "Origins" }],
  }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({
    orders: {},
    labels: {
      cardTypes: {},
      superTypes: {},
      domains: {},
      rarities: {},
      finishes: {},
      artVariants: {},
    },
  }),
  useCustomTagList: () => ({ all: [{ slug: "alt-art", label: "Alt Art" }] }),
  useLanguageLabels: () => ({ en: "English", de: "German" }),
}));

vi.mock("@/features/cards/hooks/use-prices", () => ({
  usePrices: () => ({ get: () => undefined, has: () => false }),
}));

vi.mock("@/features/collections/hooks/use-custom-tag-assignments", () => ({
  useCustomTagAssignments: () => ({}),
}));

const { RuleFilterEditor } = await import("./rule-filter-editor");

describe("RuleFilterEditor presence folding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers each dimension in the Add filter menu, not a standalone 'Has any …' entry", async () => {
    const user = userEvent.setup();
    render(
      <RuleFilterEditor
        value={EMPTY_CARD_FILTERS}
        onChange={() => {}}
        priceMarketplace={null}
        onPriceMarketplaceChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add filter/iu }));

    expect(await screen.findByRole("menuitem", { name: "Markers" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Custom Tags" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /has any marker/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /has any tag/iu })).not.toBeInTheDocument();
  });

  it("shows the parent dimension row when only its presence is set", () => {
    const value: CardFilters = { ...EMPTY_CARD_FILTERS, presence: { markers: "any" } };
    render(
      <RuleFilterEditor
        value={value}
        onChange={() => {}}
        priceMarketplace={null}
        onPriceMarketplaceChange={() => {}}
      />,
    );

    expect(screen.getByRole("button", { name: "Remove Markers filter" })).toBeInTheDocument();
  });

  it("offers a Price criterion whose first bound persists the default marketplace", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onPriceMarketplaceChange = vi.fn();
    render(
      <RuleFilterEditor
        value={EMPTY_CARD_FILTERS}
        onChange={onChange}
        priceMarketplace={null}
        onPriceMarketplaceChange={onPriceMarketplaceChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /add filter/iu }));
    await user.click(await screen.findByRole("menuitem", { name: "Price" }));

    expect(screen.getByLabelText("Price marketplace")).toBeInTheDocument();
    expect(
      screen.getByText(/cards can join or leave this list on their own/iu),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText("Minimum price"), "2");

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ price: { min: 2, max: null } }),
    );
    // Default marketplace order starts with CardTrader.
    expect(onPriceMarketplaceChange).toHaveBeenCalledWith("cardtrader");
  });

  it("shows the Price row when the filter carries a bound", () => {
    const value: CardFilters = { ...EMPTY_CARD_FILTERS, price: { min: null, max: 5 } };
    render(
      <RuleFilterEditor
        value={value}
        onChange={() => {}}
        priceMarketplace="cardmarket"
        onPriceMarketplaceChange={() => {}}
      />,
    );

    expect(screen.getByLabelText("Maximum price")).toHaveValue(5);
    expect(screen.getByRole("button", { name: "Remove Price filter" })).toBeInTheDocument();
  });

  it("keeps the Price row when its last bound is cleared, until it is removed", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [value, setValue] = useState<CardFilters>({
        ...EMPTY_CARD_FILTERS,
        price: { min: null, max: 5 },
      });
      return (
        <RuleFilterEditor
          value={value}
          onChange={setValue}
          priceMarketplace="cardmarket"
          onPriceMarketplaceChange={() => {}}
        />
      );
    }
    render(<Harness />);

    await user.clear(screen.getByLabelText("Maximum price"));

    expect(screen.getByLabelText("Maximum price")).toHaveValue(null);
    expect(screen.getByRole("button", { name: "Remove Price filter" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove Price filter" }));

    expect(screen.queryByLabelText("Maximum price")).not.toBeInTheDocument();
  });

  it("clears include, exclude, and presence together in a single change on remove", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value: CardFilters = {
      ...EMPTY_CARD_FILTERS,
      markerSlugs: ["promo"],
      presence: { markers: "any" },
    };
    render(
      <RuleFilterEditor
        value={value}
        onChange={onChange}
        priceMarketplace={null}
        onPriceMarketplaceChange={() => {}}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Remove Markers filter" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ markerSlugs: [], markerSlugsExclude: [], presence: {} }),
    );
  });
});
