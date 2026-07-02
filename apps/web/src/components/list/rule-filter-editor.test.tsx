import type * as Shared from "@openrift/shared";
import type { CardFilters } from "@openrift/shared";
import { EMPTY_CARD_FILTERS } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

// getAvailableFilters is fed real printings in the app; here we return a fixed
// facet set so only Markers and Custom Tags are offered — enough to prove the
// presence folding without dragging in the whole catalog. Everything else in
// @openrift/shared (EMPTY_CARD_FILTERS, types) stays real.
const AVAILABLE = {
  hasNonStandard: true,
  types: [],
  superTypes: [],
  domains: [],
  keywords: [],
  hasBanned: false,
  sets: [],
  rarities: [],
  finishes: [],
  artVariants: [],
  markers: [{ slug: "promo", label: "Promo" }],
  distributionChannels: [],
  hasSigned: false,
};

vi.mock("@openrift/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof Shared>();
  return { ...actual, getAvailableFilters: () => AVAILABLE };
});

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({
    allPrintings: [{ language: "en" }, { language: "de" }],
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

const { RuleFilterEditor } = await import("./rule-filter-editor");

describe("RuleFilterEditor presence folding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("offers each dimension in the Add filter menu, not a standalone 'Has any …' entry", async () => {
    const user = userEvent.setup();
    render(<RuleFilterEditor value={EMPTY_CARD_FILTERS} onChange={() => {}} />);

    await user.click(screen.getByRole("button", { name: /add filter/iu }));

    expect(await screen.findByRole("menuitem", { name: "Markers" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Custom Tags" })).toBeInTheDocument();
    // The regression: presence must fold into its picker, never appear here.
    expect(screen.queryByRole("menuitem", { name: /has any marker/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /has any tag/iu })).not.toBeInTheDocument();
  });

  it("shows the parent dimension row when only its presence is set", () => {
    const value: CardFilters = { ...EMPTY_CARD_FILTERS, presence: { markers: "any" } };
    render(<RuleFilterEditor value={value} onChange={() => {}} />);

    expect(screen.getByRole("button", { name: "Remove Markers filter" })).toBeInTheDocument();
  });

  it("clears include, exclude, and presence together in a single change on remove", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const value: CardFilters = {
      ...EMPTY_CARD_FILTERS,
      markerSlugs: ["promo"],
      presence: { markers: "any" },
    };
    render(<RuleFilterEditor value={value} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: "Remove Markers filter" }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ markerSlugs: [], markerSlugsExclude: [], presence: {} }),
    );
  });
});
