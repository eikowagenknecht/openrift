import type {
  MetaCrossSourceRow,
  MetaPlayerMatchSuggestion,
} from "@openrift/shared/types/api/meta";
import { describe, expect, it } from "vitest";

import { crossSourceAutoLinks, crossSourceProgress } from "./meta-cross-source";

function suggestion(overrides: Partial<MetaPlayerMatchSuggestion> = {}): MetaPlayerMatchSuggestion {
  return {
    metaEventPlayerId: "live-1",
    playerName: "Ashe",
    rank: 1,
    rankIsTier: false,
    deckId: null,
    score: 11,
    reasons: ["same player", "same finish"],
    isCurrent: false,
    isExact: true,
    ...overrides,
  };
}

function row(overrides: Partial<MetaCrossSourceRow> = {}): MetaCrossSourceRow {
  return {
    provider: "topdeck",
    sourceIdentity: "ta",
    playerName: "Ashe",
    rank: 1,
    legendName: null,
    hasDeck: false,
    state: "unreviewed",
    metaEventPlayerId: null,
    suggestions: [suggestion()],
    ...overrides,
  };
}

describe("crossSourceProgress", () => {
  it("counts only the named mirror's rows", () => {
    const rows = [
      row({ sourceIdentity: "ta", state: "linked" }),
      row({ sourceIdentity: "tb", state: "distinct" }),
      row({ sourceIdentity: "tc" }),
      row({ provider: "playloltcg", sourceIdentity: "pa" }),
    ];

    expect(crossSourceProgress(rows, "topdeck")).toEqual({
      total: 3,
      linked: 1,
      distinct: 1,
      unreviewed: 1,
    });
  });

  it("reports an empty review as nothing to do", () => {
    expect(crossSourceProgress([], "topdeck")).toEqual({
      total: 0,
      linked: 0,
      distinct: 0,
      unreviewed: 0,
    });
  });
});

describe("crossSourceAutoLinks", () => {
  it("takes an undecided row whose only exact suggestion is one live row", () => {
    expect(crossSourceAutoLinks([row()])).toEqual([
      {
        provider: "topdeck",
        sourceIdentity: "ta",
        playerName: "Ashe",
        metaEventPlayerId: "live-1",
      },
    ]);
  });

  it("leaves a row that is already decided", () => {
    expect(crossSourceAutoLinks([row({ state: "linked" })])).toEqual([]);
    expect(crossSourceAutoLinks([row({ state: "distinct" })])).toEqual([]);
  });

  it("leaves a row whose best suggestion is not exact", () => {
    const rows = [row({ suggestions: [suggestion({ isExact: false })] })];

    expect(crossSourceAutoLinks(rows)).toEqual([]);
  });

  it("leaves a row two live entries match exactly, since only a person can tell them apart", () => {
    const rows = [
      row({
        suggestions: [suggestion(), suggestion({ metaEventPlayerId: "live-2" })],
      }),
    ];

    expect(crossSourceAutoLinks(rows)).toEqual([]);
  });

  it("leaves both rows when two entries of one mirror reach for the same live row", () => {
    const rows = [row({ sourceIdentity: "ta" }), row({ sourceIdentity: "tb" })];

    expect(crossSourceAutoLinks(rows)).toEqual([]);
  });

  it("keeps two entries of different mirrors that reach for one live row", () => {
    const rows = [
      row({ provider: "topdeck", sourceIdentity: "ta" }),
      row({ provider: "playloltcg", sourceIdentity: "pa" }),
    ];

    expect(crossSourceAutoLinks(rows).map((pick) => pick.provider)).toEqual([
      "topdeck",
      "playloltcg",
    ]);
  });
});
