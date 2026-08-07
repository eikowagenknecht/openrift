import { describe, expect, it } from "vitest";

import { pickDockSide } from "./hovered-card-preview";

// A 1200px viewport: midline at 600, deadband edges at 552 and 648.
const WIDTH = 1200;

describe("pickDockSide", () => {
  it("docks opposite the cursor on the first hover", () => {
    expect(pickDockSide(100, null, WIDTH)).toBe("right");
    expect(pickDockSide(1100, null, WIDTH)).toBe("left");
  });

  it("switches sides once the cursor is clearly past the midline", () => {
    expect(pickDockSide(200, "left", WIDTH)).toBe("right");
    expect(pickDockSide(1000, "right", WIDTH)).toBe("left");
  });

  it("keeps the previous side inside the deadband", () => {
    // Just past the midline either way — not far enough to move the panel.
    expect(pickDockSide(610, "left", WIDTH)).toBe("left");
    expect(pickDockSide(610, "right", WIDTH)).toBe("right");
    expect(pickDockSide(590, "left", WIDTH)).toBe("left");
    expect(pickDockSide(590, "right", WIDTH)).toBe("right");
  });

  it("holds the side right up to the deadband edge, then flips", () => {
    expect(pickDockSide(552, "left", WIDTH)).toBe("left");
    expect(pickDockSide(551, "left", WIDTH)).toBe("right");
    expect(pickDockSide(648, "right", WIDTH)).toBe("right");
    expect(pickDockSide(649, "right", WIDTH)).toBe("left");
  });

  it("scales the midline with the viewport", () => {
    // 600px viewport: midline 300, so an x of 400 sits in the right half.
    expect(pickDockSide(400, null, 600)).toBe("left");
    expect(pickDockSide(400, null, 1600)).toBe("right");
  });
});
