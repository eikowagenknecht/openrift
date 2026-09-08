import type { CardLabels } from "@openrift/shared/scan/labels";
import { WellKnown } from "@openrift/shared/well-known";
import { describe, expect, it } from "vitest";

import { toIdentifyCandidates } from "@/features/scan/lib/scan-identify";

const labels: CardLabels = {
  "key-portrait": { name: "Yasuo", code: "OGN-042", language: "EN" },
  "key-landscape": {
    name: "Howling Abyss",
    code: "OGN-101",
    language: "EN",
    type: WellKnown.cardType.BATTLEFIELD,
  },
};

describe("toIdentifyCandidates", () => {
  it("labels each candidate and marks battlefields as landscape", () => {
    expect(
      toIdentifyCandidates(labels, [
        { key: "key-portrait", artKey: "art-1" },
        { key: "key-landscape", artKey: "art-2" },
      ]),
    ).toEqual([
      { key: "key-portrait", artKey: "art-1", label: "Yasuo (OGN-042 EN)", landscape: false },
      {
        key: "key-landscape",
        artKey: "art-2",
        label: "Howling Abyss (OGN-101 EN)",
        landscape: true,
      },
    ]);
  });

  it("falls back to a stub label for a key the bank does not know", () => {
    const [candidate] = toIdentifyCandidates(labels, [{ key: "abcdef1234", artKey: "art-3" }]);
    expect(candidate?.label).toBe("unknown abcdef12");
    expect(candidate?.landscape).toBe(false);
  });
});
