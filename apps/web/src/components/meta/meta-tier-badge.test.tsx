import type { MetaEventTier } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetaTierBadge } from "./meta-tier-badge";

const TIERS: MetaEventTier[] = ["premier", "competitive", "store", "casual"];

describe("MetaTierBadge", () => {
  it("names each tier in the archive's own vocabulary", () => {
    render(
      <>
        {TIERS.map((tier) => (
          <MetaTierBadge key={tier} tier={tier} />
        ))}
      </>,
    );
    expect(screen.getByText("Premier")).toBeInTheDocument();
    expect(screen.getByText("Competitive")).toBeInTheDocument();
    expect(screen.getByText("Store")).toBeInTheDocument();
    expect(screen.getByText("Casual")).toBeInTheDocument();
  });

  it("gives the gold outline to premier alone", () => {
    render(
      <>
        {TIERS.map((tier) => (
          <MetaTierBadge key={tier} tier={tier} />
        ))}
      </>,
    );
    expect(screen.getByText("Premier")).toHaveClass("border-border-accent");
    for (const label of ["Competitive", "Store", "Casual"]) {
      expect(screen.getByText(label)).not.toHaveClass("border-border-accent");
    }
  });

  it("pins the competitive teal in dark mode so it cannot collide with the gold", () => {
    render(<MetaTierBadge tier="competitive" />);
    expect(screen.getByText("Competitive")).toHaveClass("dark:text-teal-300");
  });

  it("outlines the two ranked tiers and fills the two unranked ones", () => {
    render(
      <>
        {TIERS.map((tier) => (
          <MetaTierBadge key={tier} tier={tier} />
        ))}
      </>,
    );
    expect(screen.getByText("Premier")).toHaveAttribute("data-variant", "outline");
    expect(screen.getByText("Competitive")).toHaveAttribute("data-variant", "outline");
    expect(screen.getByText("Store")).toHaveAttribute("data-variant", "muted");
    expect(screen.getByText("Casual")).toHaveAttribute("data-variant", "muted");
  });

  it("takes call-site classes", () => {
    render(<MetaTierBadge tier="store" className="ml-2" />);
    expect(screen.getByText("Store")).toHaveClass("ml-2");
  });
});
