import { describe, expect, it } from "vitest";

import { needsCssRotation } from "./images";

describe("needsCssRotation", () => {
  it("returns true for landscape orientation", () => {
    expect(needsCssRotation("landscape")).toBe(true);
  });

  it("returns false for portrait orientation", () => {
    expect(needsCssRotation("portrait")).toBe(false);
  });
});
