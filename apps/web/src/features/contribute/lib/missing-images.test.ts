import type { MissingImagePrinting } from "@openrift/shared/contracts/card-submissions";
import { describe, expect, it } from "vitest";

import { nextMissingImage, remainingMissingImagesLine } from "./missing-images";

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

describe("nextMissingImage", () => {
  it("picks the item right after the current one", () => {
    const items = [printing("a"), printing("b"), printing("c")];

    const { next, remaining } = nextMissingImage(items, "a");

    expect(next?.printingId).toBe("b");
    expect(remaining).toBe(2);
  });

  it("wraps to the first item when the current one is last", () => {
    const items = [printing("a"), printing("b"), printing("c")];

    expect(nextMissingImage(items, "c").next?.printingId).toBe("a");
  });

  it("starts at the first item when the current printing is not in the list", () => {
    const items = [printing("a"), printing("b")];

    const { next, remaining } = nextMissingImage(items, "gone");

    expect(next?.printingId).toBe("a");
    expect(remaining).toBe(2);
  });

  it("has no next item when only the current printing is left", () => {
    expect(nextMissingImage([printing("a")], "a")).toEqual({ next: null, remaining: 0 });
  });

  it("has no next item for an empty list", () => {
    expect(nextMissingImage([], "a")).toEqual({ next: null, remaining: 0 });
  });
});

describe("remainingMissingImagesLine", () => {
  it("stays silent at zero", () => {
    expect(remainingMissingImagesLine(0)).toBeNull();
  });

  it("uses the singular for one card", () => {
    expect(remainingMissingImagesLine(1)).toBe("1 more card you own has no image yet");
  });

  it("uses the plural above one", () => {
    expect(remainingMissingImagesLine(3)).toBe("3 more cards you own have no image yet");
  });
});
