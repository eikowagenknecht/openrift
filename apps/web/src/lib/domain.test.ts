import { describe, expect, it } from "vitest";

import {
  computeDomainDisabled,
  formatDomainFilterLabel,
  getDomainGradientStyle,
  getDomainTintStyle,
  getPipBackgroundStyle,
  getPipGlyphTint,
} from "./domain";

const DOMAIN_OPTIONS = ["fury", "calm", "mind", "body", "chaos", "order", "colorless"] as const;

describe("getDomainGradientStyle", () => {
  it("returns a solid background color for a single domain", () => {
    const style = getDomainGradientStyle(["fury"]);
    expect(style).toEqual({ backgroundColor: "#CB212D" });
  });

  it("returns a linear gradient for a dual domain", () => {
    const style = getDomainGradientStyle(["mind", "chaos"]);
    expect(style).toEqual({
      background: "linear-gradient(90deg, #227799 30%, #6B4891 70%)",
    });
  });

  it("applies alpha suffix when provided", () => {
    const style = getDomainGradientStyle(["fury"], "40");
    expect(style).toEqual({ backgroundColor: "#CB212D40" });
  });

  it("applies alpha to both colors in a gradient", () => {
    const style = getDomainGradientStyle(["mind", "chaos"], "80");
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
    const style = getDomainGradientStyle(["fury", "calm"], "40");
    expect(style).toEqual({
      background: "linear-gradient(90deg, #CB212D40 30%, #16AA7140 70%)",
    });
  });
});

describe("getDomainTintStyle", () => {
  it("returns a single-color gradient for a single domain", () => {
    const style = getDomainTintStyle(["fury"]);
    expect(style.backgroundImage).toContain("#CB212D");
    expect(style.backgroundImage).toContain("to bottom");
  });

  it("returns a two-color gradient for a dual domain", () => {
    const style = getDomainTintStyle(["mind", "chaos"]);
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

describe("formatDomainFilterLabel", () => {
  it('returns "None" for Colorless', () => {
    expect(formatDomainFilterLabel("colorless")).toBe("None");
  });

  it("returns the domain name as-is for other domains", () => {
    expect(formatDomainFilterLabel("fury")).toBe("fury");
  });
});

describe("computeDomainDisabled", () => {
  it("disables nothing when no domain is selected, except never colorless either", () => {
    expect(computeDomainDisabled([], DOMAIN_OPTIONS).size).toBe(0);
  });

  it("disables colorless once a real domain is picked", () => {
    const disabled = computeDomainDisabled(["fury"], DOMAIN_OPTIONS);
    expect(disabled.has("colorless")).toBe(true);
    expect(disabled.has("mind")).toBe(false);
  });

  it("disables all unselected domains once two are picked", () => {
    const disabled = computeDomainDisabled(["fury", "mind"], DOMAIN_OPTIONS);
    expect(disabled.has("calm")).toBe(true);
    expect(disabled.has("colorless")).toBe(true);
    expect(disabled.has("fury")).toBe(false);
    expect(disabled.has("mind")).toBe(false);
  });

  it("disables every other domain when colorless is selected", () => {
    const disabled = computeDomainDisabled(["colorless"], DOMAIN_OPTIONS);
    expect(disabled.has("fury")).toBe(true);
    expect(disabled.has("colorless")).toBe(false);
  });
});

describe("getPipBackgroundStyle", () => {
  it("returns a solid color for a single domain", () => {
    expect(getPipBackgroundStyle(["fury"])).toEqual({ backgroundColor: "#CB212D" });
  });

  it("returns a hard 50/50 split for a dual domain", () => {
    expect(getPipBackgroundStyle(["mind", "chaos"])).toEqual({
      background: "linear-gradient(90deg, #227799 50%, #6B4891 50%)",
    });
  });

  it("honors overridden domain colors", () => {
    expect(getPipBackgroundStyle(["fury"], { fury: "#000000" })).toEqual({
      backgroundColor: "#000000",
    });
  });
});

describe("getPipGlyphTint", () => {
  it("picks black for light single-domain backgrounds", () => {
    expect(getPipGlyphTint(["order"])).toBe("black");
    expect(getPipGlyphTint(["body"])).toBe("black");
    expect(getPipGlyphTint(["calm"])).toBe("black");
  });

  it("picks white for dark single-domain backgrounds", () => {
    expect(getPipGlyphTint(["fury"])).toBe("white");
    expect(getPipGlyphTint(["mind"])).toBe("white");
    expect(getPipGlyphTint(["chaos"])).toBe("white");
    expect(getPipGlyphTint(["colorless"])).toBe("white");
  });

  it("always picks white for a two-domain pip, even with a light domain", () => {
    expect(getPipGlyphTint(["fury", "order"])).toBe("white");
    expect(getPipGlyphTint(["order", "body"])).toBe("white");
    expect(getPipGlyphTint(["mind", "chaos"])).toBe("white");
  });

  it("follows overridden domain colors", () => {
    expect(getPipGlyphTint(["fury"], { fury: "#ffffff" })).toBe("black");
  });
});
