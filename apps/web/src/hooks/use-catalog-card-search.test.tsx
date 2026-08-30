import type { Card, Printing } from "@openrift/shared";
import { WellKnown } from "@openrift/shared";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { resetIdCounter, stubCard } from "@/test/factories";

let cardsById: Record<string, Card> = {};
const printingsByCardId = new Map<string, Printing[]>();

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ cardsById, printingsByCardId }),
}));

vi.mock("@/components/cards/printing-option-content", () => ({
  CardThumbnail: () => null,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useCatalogCardSearch } from "./use-catalog-card-search";

const LEGEND = WellKnown.cardType.LEGEND;
const UNIT = WellKnown.cardType.UNIT;

const isLegend = (card: Card) => card.types.includes(LEGEND);

beforeEach(() => {
  resetIdCounter();
  cardsById = {};
  printingsByCardId.clear();
});

describe("useCatalogCardSearch", () => {
  it("matches across the whole catalog when no filter is given", () => {
    cardsById["legend-1"] = stubCard({ name: "Yasuo", types: [LEGEND] });
    cardsById["unit-1"] = stubCard({ name: "Yasuo, Windrider", types: [UNIT] });

    const { result } = renderHook(() => useCatalogCardSearch("yasuo"));

    expect(result.current.map((row) => row.id).toSorted()).toEqual(["legend-1", "unit-1"]);
  });

  it("only searches cards the filter admits", () => {
    cardsById["legend-1"] = stubCard({ name: "Yasuo", types: [LEGEND] });
    cardsById["unit-1"] = stubCard({ name: "Yasuo, Windrider", types: [UNIT] });

    const { result } = renderHook(() => useCatalogCardSearch("yasuo", isLegend));

    expect(result.current.map((row) => row.id)).toEqual(["legend-1"]);
  });

  it("matches a legend by its champion tag and labels it with the champion form", () => {
    cardsById["legend-1"] = stubCard({
      name: "Emperor of the Sands",
      types: [LEGEND],
      tags: ["Azir"],
    });

    const { result } = renderHook(() => useCatalogCardSearch("azir", isLegend));

    expect(result.current.map((row) => row.label)).toEqual(["Azir, Emperor of the Sands"]);
  });

  it("returns nothing when the filter admits no card", () => {
    cardsById["unit-1"] = stubCard({ name: "Yasuo, Windrider", types: [UNIT] });

    const { result } = renderHook(() => useCatalogCardSearch("yasuo", isLegend));

    expect(result.current).toEqual([]);
  });

  it("returns nothing for a query below the minimum length", () => {
    cardsById["legend-1"] = stubCard({ name: "Yasuo", types: [LEGEND] });

    const { result } = renderHook(() => useCatalogCardSearch("y", isLegend));

    expect(result.current).toEqual([]);
  });
});
