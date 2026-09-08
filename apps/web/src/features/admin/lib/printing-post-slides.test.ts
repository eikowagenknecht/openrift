import { describe, expect, it } from "vitest";

import type { PostSlide } from "./printing-post-slides";
import {
  addSlide,
  decodePostSlides,
  encodePostSlides,
  moveSlide,
  removeSlide,
} from "./printing-post-slides";

const first: PostSlide = { printingId: "p-1", imageFileId: "img-1" };
const second: PostSlide = { printingId: "p-1", imageFileId: "img-2" };
const third: PostSlide = { printingId: "p-2", imageFileId: "img-3" };

describe("encodePostSlides", () => {
  it("joins each pair with a colon and the pairs with a comma", () => {
    expect(encodePostSlides([first, third])).toBe("p-1:img-1,p-2:img-3");
  });

  it("encodes an empty composition as an empty string", () => {
    expect(encodePostSlides([])).toBe("");
  });
});

describe("decodePostSlides", () => {
  it("reads back what it encoded", () => {
    const slides = [first, second, third];
    expect(decodePostSlides(encodePostSlides(slides))).toEqual(slides);
  });

  it("treats a missing or empty value as no slides", () => {
    expect(decodePostSlides(undefined)).toEqual([]);
    expect(decodePostSlides("")).toEqual([]);
  });

  it("drops entries that are not a printing and image pair", () => {
    expect(decodePostSlides("p-1,p-1:img-1,p-2:img-3:extra")).toEqual([first]);
  });

  it("drops entries with an empty half", () => {
    expect(decodePostSlides(":img-1,p-1:,p-1:img-1")).toEqual([first]);
  });

  it("keeps the first of a repeated pair", () => {
    expect(decodePostSlides("p-1:img-1,p-2:img-3,p-1:img-1")).toEqual([first, third]);
  });

  it("keeps two images of the same printing apart", () => {
    expect(decodePostSlides("p-1:img-1,p-1:img-2")).toEqual([first, second]);
  });

  it("trims padding around the ids", () => {
    expect(decodePostSlides(" p-1 : img-1 ")).toEqual([first]);
  });
});

describe("addSlide", () => {
  it("appends a slide that is not in the composition", () => {
    expect(addSlide([first], third)).toEqual([first, third]);
  });

  it("leaves the composition alone when the slide is already in it", () => {
    expect(addSlide([first, third], first)).toEqual([first, third]);
  });

  it("does not mutate the given array", () => {
    const slides = [first];
    addSlide(slides, third);
    expect(slides).toEqual([first]);
  });
});

describe("removeSlide", () => {
  it("drops the slide at the index", () => {
    expect(removeSlide([first, second, third], 1)).toEqual([first, third]);
  });

  it("ignores an index outside the composition", () => {
    expect(removeSlide([first], 3)).toEqual([first]);
    expect(removeSlide([first], -1)).toEqual([first]);
  });
});

describe("moveSlide", () => {
  it("moves a slide later", () => {
    expect(moveSlide([first, second, third], 0, 2)).toEqual([second, third, first]);
  });

  it("moves a slide earlier", () => {
    expect(moveSlide([first, second, third], 2, 0)).toEqual([third, first, second]);
  });

  it("ignores a move to the same place", () => {
    expect(moveSlide([first, second], 1, 1)).toEqual([first, second]);
  });

  it("ignores an index outside the composition", () => {
    expect(moveSlide([first, second], 0, 5)).toEqual([first, second]);
    expect(moveSlide([first, second], -1, 0)).toEqual([first, second]);
  });

  it("does not mutate the given array", () => {
    const slides = [first, second];
    moveSlide(slides, 0, 1);
    expect(slides).toEqual([first, second]);
  });
});
