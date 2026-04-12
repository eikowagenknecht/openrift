import { describe, expect, it } from "vitest";

import { toCardImageVariants } from "./card-image.js";

describe("toCardImageVariants", () => {
  it("expands a stored base URL into full and thumbnail variants", () => {
    expect(toCardImageVariants("/media/cards/d2/019d0b5b-543c-743f-801c-5a158d14ded2")).toEqual({
      full: "/media/cards/d2/019d0b5b-543c-743f-801c-5a158d14ded2-full.webp",
      thumbnail: "/media/cards/d2/019d0b5b-543c-743f-801c-5a158d14ded2-400w.webp",
    });
  });

  it("returns null when the input is null", () => {
    expect(toCardImageVariants(null)).toBeNull();
  });
});
