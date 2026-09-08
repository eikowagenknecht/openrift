import type { ProviderSettingResponse } from "@openrift/shared/types/api/admin";
import { describe, expect, it } from "vitest";

import {
  favoriteProviderSet,
  getProviderLabel,
  isChecked,
  isFavoriteProvider,
  sortCandidateRows,
} from "./candidate-rows";

function setting(
  provider: string,
  overrides: Partial<ProviderSettingResponse> = {},
): ProviderSettingResponse {
  return {
    provider,
    sortOrder: 0,
    isHidden: false,
    isFavorite: false,
    helperReviewable: false,
    ...overrides,
  };
}

describe("getProviderLabel", () => {
  it("prefers the row's own provider", () => {
    expect(getProviderLabel({ id: "abcdef0123", checkedAt: null, provider: "riot" })).toBe("riot");
  });

  it("inherits the parent candidate card's label", () => {
    const row = { id: "abcdef0123", checkedAt: null, candidateCardId: "card-1" };
    expect(getProviderLabel(row, { "card-1": "piltover" })).toBe("piltover");
  });

  it("falls back to a label derived from the row id", () => {
    expect(getProviderLabel({ id: "abcdef0123456", checkedAt: null })).toBe("provider-abcdef01");
  });

  it("falls back when the parent card has no label", () => {
    const row = { id: "abcdef0123456", checkedAt: null, candidateCardId: "card-9" };
    expect(getProviderLabel(row, { "card-1": "piltover" })).toBe("provider-abcdef01");
  });
});

describe("isChecked", () => {
  it("is true only for a row with a checked timestamp", () => {
    expect(isChecked({ id: "a", checkedAt: "2026-01-01T00:00:00Z" })).toBe(true);
    expect(isChecked({ id: "a", checkedAt: null })).toBe(false);
  });
});

describe("favoriteProviderSet", () => {
  it("keeps only the favorites", () => {
    const settings = [setting("riot", { isFavorite: true }), setting("piltover")];
    expect([...favoriteProviderSet(settings)]).toEqual(["riot"]);
  });

  it("is empty without settings", () => {
    expect(favoriteProviderSet().size).toBe(0);
  });
});

describe("isFavoriteProvider", () => {
  it("matches on the resolved provider label", () => {
    const row = { id: "a", checkedAt: null, candidateCardId: "card-1" };
    const favorites = new Set(["piltover"]);
    expect(isFavoriteProvider(row, { "card-1": "piltover" }, favorites)).toBe(true);
    expect(isFavoriteProvider(row, { "card-1": "riot" }, favorites)).toBe(false);
  });
});

describe("sortCandidateRows", () => {
  it("orders by sortOrder, then by label", () => {
    const rows = [
      { id: "1", checkedAt: null, provider: "zeta" },
      { id: "2", checkedAt: null, provider: "alpha" },
      { id: "3", checkedAt: null, provider: "first" },
    ];
    const settings = [setting("first", { sortOrder: -1 })];
    expect(sortCandidateRows(rows, undefined, settings).map((row) => row.provider)).toEqual([
      "first",
      "alpha",
      "zeta",
    ]);
  });

  it("sorts by label alone when no settings are given", () => {
    const rows = [
      { id: "1", checkedAt: null, provider: "zeta" },
      { id: "2", checkedAt: null, provider: "alpha" },
    ];
    expect(sortCandidateRows(rows, undefined, undefined).map((row) => row.provider)).toEqual([
      "alpha",
      "zeta",
    ]);
  });

  it("does not mutate the input", () => {
    const rows = [
      { id: "1", checkedAt: null, provider: "zeta" },
      { id: "2", checkedAt: null, provider: "alpha" },
    ];
    sortCandidateRows(rows, undefined, undefined);
    expect(rows.map((row) => row.provider)).toEqual(["zeta", "alpha"]);
  });
});
