import type { MetaEventTier } from "@openrift/shared/types/enums";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetaTierBadge } from "./meta-tier-badge";

const TIERS: MetaEventTier[] = ["premier", "competitive", "local"];

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
    expect(screen.getByText("Local")).toBeInTheDocument();
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
    for (const label of ["Competitive", "Local"]) {
      expect(screen.getByText(label)).not.toHaveClass("border-border-accent");
    }
  });

  it("pins the competitive teal in dark mode so it cannot collide with the gold", () => {
    render(<MetaTierBadge tier="competitive" />);
    expect(screen.getByText("Competitive")).toHaveClass("text-primary");
  });

  it("outlines the two ranked tiers and fills the local one", () => {
    render(
      <>
        {TIERS.map((tier) => (
          <MetaTierBadge key={tier} tier={tier} />
        ))}
      </>,
    );
    expect(screen.getByText("Premier")).toHaveAttribute("data-variant", "outline");
    expect(screen.getByText("Competitive")).toHaveAttribute("data-variant", "outline");
    expect(screen.getByText("Local")).toHaveAttribute("data-variant", "muted");
  });

  it("takes call-site classes", () => {
    render(<MetaTierBadge tier="local" className="ml-2" />);
    expect(screen.getByText("Local")).toHaveClass("ml-2");
  });
});
