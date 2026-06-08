import { describe, expect, it } from "vitest";

import {
  computeDomainDisabled,
  formatDomainDisplay,
  formatDomainFilterLabel,
  getDomainGradientStyle,
  getDomainTintStyle,
} from "./domain";

const DOMAIN_OPTIONS = ["fury", "calm", "mind", "body", "chaos", "order", "colorless"] as const;

// ---------------------------------------------------------------------------
// getDomainGradientStyle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// getDomainTintStyle
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// formatDomainDisplay
// ---------------------------------------------------------------------------

describe("formatDomainDisplay", () => {
  it('returns "No Domain" for Colorless', () => {
    expect(formatDomainDisplay(["colorless"])).toBe("No Domain");
  });

  it("returns the domain name for a single domain", () => {
    expect(formatDomainDisplay(["fury"])).toBe("fury");
  });

  it("joins dual domains with spaced slash", () => {
    expect(formatDomainDisplay(["mind", "chaos"], { mind: "Mind", chaos: "Chaos" })).toBe(
      "Mind / Chaos",
    );
  });
});

// ---------------------------------------------------------------------------
// formatDomainFilterLabel
// ---------------------------------------------------------------------------

describe("formatDomainFilterLabel", () => {
  it('returns "None" for Colorless', () => {
    expect(formatDomainFilterLabel("colorless")).toBe("None");
  });

  it("returns the domain name as-is for other domains", () => {
    expect(formatDomainFilterLabel("fury")).toBe("fury");
  });
});

// ---------------------------------------------------------------------------
// computeDomainDisabled
// ---------------------------------------------------------------------------

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
    // selected ones remain enabled so they can be removed
    expect(disabled.has("fury")).toBe(false);
    expect(disabled.has("mind")).toBe(false);
  });

  it("disables every other domain when colorless is selected", () => {
    const disabled = computeDomainDisabled(["colorless"], DOMAIN_OPTIONS);
    expect(disabled.has("fury")).toBe(true);
    expect(disabled.has("colorless")).toBe(false);
  });
});
