import { describe, expect, it } from "vitest";

import {
  POST_IMAGE_ASPECTS,
  POST_IMAGE_LABEL_TEXT,
  POST_IMAGE_LABELS,
  postImageAspectFromQuery,
  postImageLabelFromQuery,
  postImageScaleFromQuery,
} from "./printing-post-image.js";

describe("POST_IMAGE_LABEL_TEXT", () => {
  it("covers every label", () => {
    expect(Object.keys(POST_IMAGE_LABEL_TEXT).toSorted()).toEqual(
      [...POST_IMAGE_LABELS].toSorted(),
    );
  });
});

describe("POST_IMAGE_ASPECTS", () => {
  it("keeps every canvas 1080 wide", () => {
    for (const canvas of Object.values(POST_IMAGE_ASPECTS)) {
      expect(canvas.w).toBe(1080);
      expect(canvas.h).toBeGreaterThanOrEqual(canvas.w);
    }
  });
});

describe("postImageLabelFromQuery", () => {
  it.each([...POST_IMAGE_LABELS])("passes through %s", (label) => {
    expect(postImageLabelFromQuery(label)).toBe(label);
  });

  it.each([undefined, null, "", "Released", "shipped", "0"])(
    "falls back to released for %s",
    (value) => {
      expect(postImageLabelFromQuery(value)).toBe("released");
    },
  );
});

describe("postImageAspectFromQuery", () => {
  it.each(["square", "portrait", "story"])("passes through %s", (aspect) => {
    expect(postImageAspectFromQuery(aspect)).toBe(aspect);
  });

  it.each([undefined, null, "", "landscape", "Square"])("falls back to square for %s", (value) => {
    expect(postImageAspectFromQuery(value)).toBe("square");
  });

  it("does not accept an inherited object key", () => {
    expect(postImageAspectFromQuery("toString")).toBe("square");
    expect(postImageAspectFromQuery("constructor")).toBe("square");
  });
});

describe("postImageScaleFromQuery", () => {
  it("accepts 2", () => {
    expect(postImageScaleFromQuery("2")).toBe(2);
  });

  it.each([undefined, null, "", "1", "0", "3", "1.5", "-2", "two", "2px"])(
    "falls back to 1 for %s",
    (value) => {
      expect(postImageScaleFromQuery(value)).toBe(1);
    },
  );
});
