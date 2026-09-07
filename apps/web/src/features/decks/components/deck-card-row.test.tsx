import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PowerDomainIcon, PowerPips } from "./deck-card-row";

const COLORS = { fury: "#cb212d", calm: "#16aa71", colorless: "#737373" };

function renderPip(domains: string[]) {
  const { container } = render(<PowerDomainIcon domains={domains} colors={COLORS} />);
  const pip = container.firstElementChild;
  if (!pip) {
    throw new Error("pip did not render");
  }
  return pip;
}

describe("PowerDomainIcon", () => {
  it("shows the domain's own badge for a single-domain card", () => {
    const pip = renderPip(["fury"]);
    expect(pip.tagName).toBe("IMG");
    expect(pip.getAttribute("src")).toBe("/images/domains/fury.webp");
  });

  it("shows the wild rune for a dual-domain card, tinted with both domains", () => {
    const pip = renderPip(["fury", "calm"]);
    const style = pip.getAttribute("style") ?? "";
    expect(style).toContain("/images/glyphs/rune-rainbow.svg");
    expect(style).not.toContain("/images/domains/colorless.svg");
    expect(style).toContain("rgb(203, 33, 45)");
    expect(style).toContain("rgb(22, 170, 113)");
  });

  it("masks the colorless rune instead of rendering it as an image", () => {
    const pip = renderPip(["colorless"]);
    expect(pip.tagName).not.toBe("IMG");
    const style = pip.getAttribute("style") ?? "";
    expect(style).toContain("/images/domains/colorless.svg");
    expect(style).toContain("rgb(115, 115, 115)");
  });

  it("falls back to the colorless grey when a card carries no domain at all", () => {
    const style = renderPip([]).getAttribute("style") ?? "";
    expect(style).toContain("/images/domains/colorless.svg");
    expect(style).toContain("rgb(115, 115, 115)");
  });
});

const DOMAIN_LABELS = { fury: "Fury", calm: "Calm", colorless: "Colorless" };

function renderPips(power: number | null, domains: string[]) {
  const { container } = render(
    <PowerPips power={power} domains={domains} colors={COLORS} domainLabels={DOMAIN_LABELS} />,
  );
  return container;
}

describe("PowerPips", () => {
  it("names the stack once and leaves the pips decorative", () => {
    const stack = renderPips(3, ["fury"]).querySelector('[role="img"]');
    expect(stack?.getAttribute("aria-label")).toBe("Power 3 (Fury)");
    const pips = stack?.querySelectorAll("img") ?? [];
    expect(pips.length).toBe(3);
    for (const pip of pips) {
      expect(pip.getAttribute("alt")).toBe("");
    }
  });

  it("names a dual-domain stack the masked pips can't name themselves", () => {
    const stack = renderPips(2, ["fury", "calm"]).querySelector('[role="img"]');
    expect(stack?.getAttribute("aria-label")).toBe("Power 2 (Fury, Calm)");
  });

  it("drops the domains from the name when a card carries none", () => {
    const stack = renderPips(1, []).querySelector('[role="img"]');
    expect(stack?.getAttribute("aria-label")).toBe("Power 1");
  });

  it("renders nothing for a card with no power cost", () => {
    expect(renderPips(0, ["fury"]).children.length).toBe(0);
    expect(renderPips(null, ["fury"]).children.length).toBe(0);
  });
});
