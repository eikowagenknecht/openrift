import { describe, expect, it } from "vitest";

import { getPlaysetSize } from "./playset.js";

describe("getPlaysetSize", () => {
  it("returns 1 for Legend cards", () => {
    expect(getPlaysetSize(["legend"], [])).toBe(1);
    expect(getPlaysetSize(["legend"], ["Shield"])).toBe(1);
  });

  it("returns 1 for Battlefield cards", () => {
    expect(getPlaysetSize(["battlefield"], [])).toBe(1);
  });

  it("returns 1 for cards with the Unique keyword", () => {
    expect(getPlaysetSize(["unit"], ["Unique", "Shield"])).toBe(1);
  });

  it("returns 3 for Unit cards without the Unique keyword", () => {
    expect(getPlaysetSize(["unit"], ["Shield", "Accelerate"])).toBe(3);
  });

  it("returns 3 when keywords array is empty", () => {
    expect(getPlaysetSize(["unit"], [])).toBe(3);
  });

  it("returns 3 for Spell cards without Unique", () => {
    expect(getPlaysetSize(["spell"], [])).toBe(3);
  });

  it("returns 3 for multi-type cards without a 1-copy type (Unit Gear)", () => {
    expect(getPlaysetSize(["unit", "gear"], [])).toBe(3);
  });

  it("returns 1 when any type in the set is Legend or Battlefield", () => {
    expect(getPlaysetSize(["unit", "legend"], [])).toBe(1);
    expect(getPlaysetSize(["unit", "battlefield"], [])).toBe(1);
  });
});
