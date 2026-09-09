import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import { describe, expect, it } from "vitest";

import { otherMissingImages } from "./missing-images";

function printing(printingId: string): MissingImagePrinting {
  return {
    printingId,
    cardSlug: `slug-${printingId}`,
    cardName: `Card ${printingId}`,
    setSlug: "ogn",
    setName: "Origins",
    publicCode: `OGN-${printingId}`,
    finish: "normal",
    language: "EN",
    copies: 1,
  };
}

describe("otherMissingImages", () => {
  it("drops the current printing and keeps the order", () => {
    const items = [printing("a"), printing("b"), printing("c")];

    expect(otherMissingImages(items, "b").map((item) => item.printingId)).toEqual(["a", "c"]);
  });

  it("keeps every item when the current printing is not in the list", () => {
    const items = [printing("a"), printing("b")];

    expect(otherMissingImages(items, "gone")).toHaveLength(2);
  });

  it("returns nothing when only the current printing is left", () => {
    expect(otherMissingImages([printing("a")], "a")).toEqual([]);
  });

  it("returns nothing for an empty list", () => {
    expect(otherMissingImages([], "a")).toEqual([]);
  });
});
