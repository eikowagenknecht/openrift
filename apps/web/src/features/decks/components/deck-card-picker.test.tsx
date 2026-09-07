import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { CardSearchResult } from "@/features/cards/lib/card-search-result";

vi.mock("@/features/cards/components/card-search-dropdown", () => ({
  CardSearchDropdown: ({
    results,
    onSearch,
    placeholder,
  }: {
    results: CardSearchResult[];
    onSearch: (query: string) => void;
    placeholder: string;
  }) => (
    <div>
      <input
        aria-label="Search"
        placeholder={placeholder}
        onChange={(event) => onSearch(event.target.value)}
      />
      <ul>
        {results.map((result) => (
          <li key={result.id} data-testid="row">
            <span data-testid="label">{result.label}</span>
            <span data-testid="detail">{result.detail}</span>
            <span data-testid="adornment">{result.adornment}</span>
            <span data-testid="leading">{result.leading}</span>
          </li>
        ))}
      </ul>
    </div>
  ),
}));

// The thumbnail and the stat glyphs pull the catalog and the domain art; they
// stand in as markers, so a row can be checked for carrying them at all.
vi.mock("@/features/cards/components/printing-option-content", () => ({
  CardThumbnail: ({ cardId }: { cardId: string }) => <span data-testid="thumb">{cardId}</span>,
}));
vi.mock("@/features/decks/components/deck-card-row", () => ({
  PowerPips: ({ power }: { power: number | null }) => <span data-testid="pips">{power}</span>,
  EnergyGlyph: ({ value }: { value: number }) => <span data-testid="energy">{value}</span>,
}));
vi.mock("@/hooks/use-domain-colors", () => ({ useDomainColors: () => ({}) }));
vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: { domains: {}, cardTypes: CARD_TYPE_LABELS } }),
}));
vi.mock("@/features/cards/hooks/use-preferred-printing", () => ({
  usePreferredPrinting: () => ({
    getPreferredPrinting: (cardId: string) => PRINTINGS[cardId],
  }),
}));

const CARD_TYPE_LABELS: Record<string, string> = {
  unit: "Unit",
  spell: "Spell",
  champion: "Champion",
  battlefield: "Battlefield",
};

interface StubPrinting {
  card: {
    name: string;
    types: string[];
    power: number | null;
    energy: number | null;
    domains: string[];
  };
}

const PRINTINGS: Record<string, StubPrinting> = {
  "card-jinx": {
    card: { name: "Jinx", types: ["champion", "unit"], power: 3, energy: 4, domains: ["fury"] },
  },
  "card-vi": {
    card: { name: "Vi", types: ["unit"], power: 2, energy: 3, domains: ["fury"] },
  },
  "card-bolt": {
    card: { name: "Piltover Bolt", types: ["spell"], power: null, energy: 1, domains: ["mind"] },
  },
  "card-nowhere": {
    card: { name: "Nowhere", types: [], power: null, energy: null, domains: [] },
  },
};

const { CardPicker } = await import("./deck-card-picker");

const CANDIDATES = [
  { cardId: "card-jinx", cardName: "Jinx" },
  { cardId: "card-vi", cardName: "Vi" },
  { cardId: "card-bolt", cardName: "Piltover Bolt" },
];

function renderPicker(candidates = CANDIDATES, listAllWhenEmpty?: boolean) {
  render(
    <CardPicker
      candidates={candidates}
      onSelect={() => {}}
      placeholder="Search a card…"
      listAllWhenEmpty={listAllWhenEmpty}
    />,
  );
}

function rowTexts(testId: string): string[] {
  return screen.getAllByTestId(testId).map((node) => node.textContent ?? "");
}

describe("CardPicker rows", () => {
  it("lists every candidate before anything is typed", () => {
    renderPicker();
    expect(rowTexts("label")).toEqual(["Jinx", "Vi", "Piltover Bolt"]);
  });

  it("caps the untyped list so a long zone can't flood the dropdown", () => {
    const many = Array.from({ length: 70 }, (_, index) => ({
      cardId: `card-${index}`,
      cardName: `Card ${index}`,
    }));
    renderPicker(many);
    expect(screen.getAllByTestId("row")).toHaveLength(50);
  });

  it("lists nothing before typing when listAllWhenEmpty is off", async () => {
    renderPicker(CANDIDATES, false);
    expect(screen.queryAllByTestId("row")).toHaveLength(0);
    await userEvent.type(screen.getByLabelText("Search"), "vi");
    expect(rowTexts("label")).toEqual(["Vi"]);
  });

  it("filters through the shared matcher once a query is typed", async () => {
    renderPicker();
    await userEvent.type(screen.getByLabelText("Search"), "bolt");
    expect(rowTexts("label")).toEqual(["Piltover Bolt"]);
  });

  it("finds nothing for a query no candidate matches", async () => {
    renderPicker();
    await userEvent.type(screen.getByLabelText("Search"), "zzz");
    expect(screen.queryAllByTestId("row")).toHaveLength(0);
  });

  it("gives every row a thumbnail, a name, stats and the card type", () => {
    renderPicker();
    expect(screen.getAllByTestId("thumb")).toHaveLength(3);
    expect(rowTexts("detail")).toEqual(["Champion Unit", "Unit", "Spell"]);
    expect(screen.getAllByTestId("pips").map((node) => node.textContent)).toEqual(["3", "2", "0"]);
    expect(screen.getAllByTestId("energy").map((node) => node.textContent)).toEqual([
      "4",
      "3",
      "1",
    ]);
  });

  it("leaves the type blank for a card the catalog doesn't know", () => {
    renderPicker([{ cardId: "card-missing", cardName: "Missing" }]);
    expect(rowTexts("detail")).toEqual([""]);
  });

  it("drops the stats for a card with neither power nor energy", () => {
    renderPicker([{ cardId: "card-nowhere", cardName: "Nowhere" }]);
    expect(rowTexts("adornment")).toEqual([""]);
  });
});
