import type {
  CandidatePrintingGroupResponse,
  CandidatePrintingResponse,
} from "@openrift/shared/types/api/admin";
import { describe, expect, it } from "vitest";

import { buildPrintingGroups } from "./candidate-printing-groups";

function candidate(id: string, shortCode = "OGN-001"): CandidatePrintingResponse {
  return {
    id,
    candidateCardId: "candidate-card",
    printingId: null,
    shortCode,
    setId: null,
    setName: null,
    rarity: null,
    artVariant: null,
    isSigned: null,
    isOvernumbered: null,
    markerSlugs: [],
    distributionChannelSlugs: [],
    finish: null,
    size: null,
    artist: null,
    publicCode: null,
    printedRulesText: null,
    printedEffectText: null,
    imageUrl: null,
    flavorText: null,
    externalId: `ext-${id}`,
    extraData: null,
    language: null,
    printedName: null,
    printedYear: null,
    checkedAt: null,
  };
}

function group(
  overrides: Partial<CandidatePrintingGroupResponse> = {},
): CandidatePrintingGroupResponse {
  return {
    mostCommonShortCode: "OGN-001",
    shortCodes: [],
    expectedPrintingId: "printing-1",
    language: null,
    suggestedPrintingId: null,
    ...overrides,
  };
}

describe("buildPrintingGroups", () => {
  it("returns nothing for no groups", () => {
    expect(buildPrintingGroups([], [candidate("cp-1")])).toEqual([]);
  });

  it("resolves each group's member ids to their candidate rows", () => {
    const groups = buildPrintingGroups(
      [group({ shortCodes: ["cp-1", "cp-2"] })],
      [candidate("cp-1"), candidate("cp-2"), candidate("cp-3")],
    );
    expect(groups[0]?.candidates.map((c) => c.id)).toEqual(["cp-1", "cp-2"]);
  });

  it("keeps the group's expected and suggested printings", () => {
    const groups = buildPrintingGroups(
      [
        group({
          shortCodes: ["cp-1"],
          expectedPrintingId: "printing-9",
          suggestedPrintingId: "printing-8",
        }),
      ],
      [candidate("cp-1")],
    );
    expect(groups[0]).toMatchObject({
      expectedPrintingId: "printing-9",
      suggestedPrintingId: "printing-8",
    });
  });

  it("drops member ids with no candidate row", () => {
    const groups = buildPrintingGroups(
      [group({ shortCodes: ["cp-1", "missing", "cp-2"] })],
      [candidate("cp-1"), candidate("cp-2")],
    );
    expect(groups[0]?.candidates.map((c) => c.id)).toEqual(["cp-1", "cp-2"]);
  });

  it("keys a group by its first candidate", () => {
    const groups = buildPrintingGroups(
      [group({ shortCodes: ["cp-2", "cp-1"] })],
      [candidate("cp-1"), candidate("cp-2")],
    );
    expect(groups[0]?.groupKey).toBe("cp-2");
  });

  it("falls back to the expected printing and position when a group resolves to nothing", () => {
    const groups = buildPrintingGroups(
      [
        group({ shortCodes: ["gone"], expectedPrintingId: "printing-1" }),
        group({ shortCodes: [], expectedPrintingId: "printing-1" }),
      ],
      [],
    );
    expect(groups.map((g) => g.groupKey)).toEqual(["printing-1-0", "printing-1-1"]);
  });

  it("keeps one group per input group, in order", () => {
    const groups = buildPrintingGroups(
      [
        group({ shortCodes: ["cp-1"], expectedPrintingId: "printing-1" }),
        group({ shortCodes: ["cp-2"], expectedPrintingId: "printing-2" }),
      ],
      [candidate("cp-1"), candidate("cp-2")],
    );
    expect(groups.map((g) => g.expectedPrintingId)).toEqual(["printing-1", "printing-2"]);
  });

  it("lets two groups share a candidate", () => {
    const groups = buildPrintingGroups(
      [group({ shortCodes: ["cp-1"] }), group({ shortCodes: ["cp-1"] })],
      [candidate("cp-1")],
    );
    expect(groups.map((g) => g.candidates.length)).toEqual([1, 1]);
  });
});
