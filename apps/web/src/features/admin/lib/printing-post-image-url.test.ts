import { describe, expect, it } from "vitest";

import {
  postImagePreviewCaption,
  printingPostImageFilename,
  printingPostImageUrl,
} from "./printing-post-image-url";

describe("printingPostImageUrl", () => {
  it("builds a same-origin URL with the label and aspect", () => {
    expect(printingPostImageUrl("p-1", { label: "released", aspect: "square" })).toBe(
      "/api/admin/v1/printing-desk/printings/p-1/post-image.png?label=released&aspect=square",
    );
  });

  it("includes the image file when one is chosen", () => {
    expect(
      printingPostImageUrl("p-1", {
        imageFileId: "img-9",
        label: "announced",
        aspect: "story",
      }),
    ).toBe(
      "/api/admin/v1/printing-desk/printings/p-1/post-image.png?imageFileId=img-9&label=announced&aspect=story",
    );
  });

  it("omits the image file when it is null or empty", () => {
    for (const imageFileId of [null, undefined, ""]) {
      expect(
        printingPostImageUrl("p-1", { imageFileId, label: "collected", aspect: "portrait" }),
      ).not.toContain("imageFileId");
    }
  });

  it("adds the scale only at 2, so the preview URL stays the default one", () => {
    expect(
      printingPostImageUrl("p-1", { label: "released", aspect: "square", scale: 1 }),
    ).not.toContain("scale");
    expect(
      printingPostImageUrl("p-1", { label: "released", aspect: "square", scale: 2 }),
    ).toContain("scale=2");
  });

  it("carries the date when one is given", () => {
    expect(
      printingPostImageUrl("p-1", { label: "released", aspect: "square", date: "2026-10-04" }),
    ).toBe(
      "/api/admin/v1/printing-desk/printings/p-1/post-image.png?label=released&aspect=square&date=2026-10-04",
    );
  });

  it("leaves the date out when there is none", () => {
    for (const date of [undefined, ""]) {
      expect(
        printingPostImageUrl("p-1", { label: "released", aspect: "square", date }),
      ).not.toContain("date");
    }
  });

  it("escapes the printing id and the image file id", () => {
    expect(
      printingPostImageUrl("p 1/2", { imageFileId: "a&b", label: "released", aspect: "square" }),
    ).toBe(
      "/api/admin/v1/printing-desk/printings/p%201%2F2/post-image.png?imageFileId=a%26b&label=released&aspect=square",
    );
  });
});

describe("postImagePreviewCaption", () => {
  it("names the square size and the download width", () => {
    expect(postImagePreviewCaption("square")).toBe(
      "Preview at half size · 1080 × 1080 · download renders at 2160 px",
    );
  });

  it("follows the chosen aspect", () => {
    expect(postImagePreviewCaption("portrait")).toContain("1080 × 1350");
    expect(postImagePreviewCaption("story")).toContain("1080 × 1920");
  });
});

describe("printingPostImageFilename", () => {
  it("names the download after the card, label, format and slide number", () => {
    expect(printingPostImageFilename("annie-dark-child", "announced", "portrait", 1)).toBe(
      "annie-dark-child-announced-portrait-1.png",
    );
  });

  it("numbers every slide of a carousel apart", () => {
    expect(printingPostImageFilename("yasuo-windchaser", "released", "square", 3)).toBe(
      "yasuo-windchaser-released-square-3.png",
    );
  });
});
