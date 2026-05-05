import { describe, expect, it } from "bun:test";

import { getPlaysetSize } from "./playset.js";

describe("getPlaysetSize", () => {
  it("returns 1 for Legend cards", () => {
    expect(getPlaysetSize("legend", [])).toBe(1);
    expect(getPlaysetSize("legend", ["Shield"])).toBe(1);
  });

  it("returns 1 for Battlefield cards", () => {
    expect(getPlaysetSize("battlefield", [])).toBe(1);
  });

  it("returns 1 for cards with the Unique keyword", () => {
    expect(getPlaysetSize("unit", ["Unique", "Shield"])).toBe(1);
  });

  it("returns 3 for Unit cards without the Unique keyword", () => {
    expect(getPlaysetSize("unit", ["Shield", "Accelerate"])).toBe(3);
  });

  it("returns 3 when keywords array is empty", () => {
    expect(getPlaysetSize("unit", [])).toBe(3);
  });

  it("returns 3 for Spell cards without Unique", () => {
    expect(getPlaysetSize("spell", [])).toBe(3);
  });
});
