import { describe, expect, it } from "vitest";

import { enumLabel } from "./enum-label.js";

describe("enumLabel", () => {
  it("returns the mapped label for a known slug", () => {
    expect(enumLabel({ epic: "Epic" }, "epic")).toBe("Epic");
  });

  it("falls back to the slug itself when the map has no entry", () => {
    expect(enumLabel({ epic: "Epic" }, "mythic")).toBe("mythic");
  });

  it("keeps a deliberately empty label instead of falling back", () => {
    expect(enumLabel({ colorless: "" }, "colorless")).toBe("");
  });

  it("falls back on an empty map", () => {
    expect(enumLabel({}, "fury")).toBe("fury");
  });
});
