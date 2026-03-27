import { describe, expect, it } from "vitest";

import {
  formatDomainDisplay,
  formatDomainFilterLabel,
  getDomainGradientStyle,
  getDomainTintStyle,
} from "./domain";

// ---------------------------------------------------------------------------
// getDomainGradientStyle
// ---------------------------------------------------------------------------

describe("getDomainGradientStyle", () => {
  it("returns a solid background color for a single domain", () => {
    const style = getDomainGradientStyle(["Fury"]);
    expect(style).toEqual({ backgroundColor: "#CB212D" });
  });

  it("returns a linear gradient for a dual domain", () => {
    const style = getDomainGradientStyle(["Mind", "Chaos"]);
    expect(style).toEqual({
      background: "linear-gradient(90deg, #227799 30%, #6B4891 70%)",
    });
  });

  it("applies alpha suffix when provided", () => {
    const style = getDomainGradientStyle(["Fury"], "40");
    expect(style).toEqual({ backgroundColor: "#CB212D40" });
  });

  it("applies alpha to both colors in a gradient", () => {
    const style = getDomainGradientStyle(["Mind", "Chaos"], "80");
    expect(style).toEqual({
      background: "linear-gradient(90deg, #22779980 30%, #6B489180 70%)",
    });
  });

  it("falls back to gray for unknown domains", () => {
    const style = getDomainGradientStyle(["Unknown"]);
    expect(style).toEqual({ backgroundColor: "#737373" });
  });

  it("falls back to gray for unknown domains in a dual-domain gradient", () => {
    const style = getDomainGradientStyle(["Unknown", "AlsoUnknown"]);
    expect(style).toEqual({
      background: "linear-gradient(90deg, #737373 30%, #737373 70%)",
    });
  });

  it("applies alpha to both colors in a dual-domain gradient", () => {
    const style = getDomainGradientStyle(["Fury", "Calm"], "40");
    expect(style).toEqual({
      background: "linear-gradient(90deg, #CB212D40 30%, #16AA7140 70%)",
    });
  });
});

// ---------------------------------------------------------------------------
// getDomainTintStyle
// ---------------------------------------------------------------------------

describe("getDomainTintStyle", () => {
  it("returns a single-color gradient for a single domain", () => {
    const style = getDomainTintStyle(["Fury"]);
    expect(style.backgroundImage).toContain("#CB212D");
    expect(style.backgroundImage).toContain("to bottom");
  });

  it("returns a two-color gradient for a dual domain", () => {
    const style = getDomainTintStyle(["Mind", "Chaos"]);
    expect(style.backgroundImage).toContain("#227799");
    expect(style.backgroundImage).toContain("#6B4891");
    expect(style.backgroundImage).toContain("135deg");
  });

  it("falls back to gray for unknown domains in dual tint", () => {
    const style = getDomainTintStyle(["Unknown", "AlsoUnknown"]);
    expect(style.backgroundImage).toContain("#737373");
    expect(style.backgroundImage).toContain("135deg");
  });
});

// ---------------------------------------------------------------------------
// formatDomainDisplay
// ---------------------------------------------------------------------------

describe("formatDomainDisplay", () => {
  it('returns "No Domain" for Colorless', () => {
    expect(formatDomainDisplay(["Colorless"])).toBe("No Domain");
  });

  it("returns the domain name for a single domain", () => {
    expect(formatDomainDisplay(["Fury"])).toBe("Fury");
  });

  it("joins dual domains with spaced slash", () => {
    expect(formatDomainDisplay(["Mind", "Chaos"])).toBe("Mind / Chaos");
  });
});

// ---------------------------------------------------------------------------
// formatDomainFilterLabel
// ---------------------------------------------------------------------------

describe("formatDomainFilterLabel", () => {
  it('returns "None" for Colorless', () => {
    expect(formatDomainFilterLabel("Colorless")).toBe("None");
  });

  it("returns the domain name as-is for other domains", () => {
    expect(formatDomainFilterLabel("Fury")).toBe("Fury");
  });
});
