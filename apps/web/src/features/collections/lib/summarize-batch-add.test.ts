import { describe, expect, it } from "vitest";

import { summarizeBatchAdd } from "./summarize-batch-add";

const nameById = (id: string) =>
  ({
    "printing-a": "Card A",
    "printing-b": "Card B",
    "printing-c": "Card C",
  })[id];

describe("summarizeBatchAdd", () => {
  it("returns null for an empty batch", () => {
    expect(summarizeBatchAdd([], nameById)).toBeNull();
  });

  it("formats a single add as 1× Card Name", () => {
    expect(summarizeBatchAdd(["printing-a"], nameById)).toBe("Added 1× Card A");
  });

  it("formats repeats of the same printing as N× Card Name", () => {
    expect(summarizeBatchAdd(["printing-a", "printing-a", "printing-a"], nameById)).toBe(
      "Added 3× Card A",
    );
  });

  it("formats a mixed batch as N cards", () => {
    expect(summarizeBatchAdd(["printing-a", "printing-b"], nameById)).toBe("Added 2 cards");
  });

  it("counts all entries including duplicates in a mixed batch", () => {
    expect(
      summarizeBatchAdd(["printing-a", "printing-a", "printing-b", "printing-c"], nameById),
    ).toBe("Added 4 cards");
  });

  it("falls back to 'card' when the name lookup is missing", () => {
    expect(summarizeBatchAdd(["printing-missing"], nameById)).toBe("Added 1× card");
  });
});
