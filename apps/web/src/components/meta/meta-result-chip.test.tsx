import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MetaResultChip } from "./meta-result-chip";

describe("MetaResultChip", () => {
  it("names the result in the organizer's words", () => {
    render(<MetaResultChip outcome="win" />);
    expect(screen.getByText("Win")).toBeInTheDocument();
  });

  it("calls an unreported result what it is, never a loss", () => {
    render(<MetaResultChip outcome="unknown" />);
    expect(screen.getByText("No result")).toBeInTheDocument();
  });

  it("prints a bye as its own kind of round", () => {
    render(<MetaResultChip outcome="bye" />);
    expect(screen.getByText("Bye")).toBeInTheDocument();
  });

  it("adds the game score from the player's own side of the match", () => {
    render(<MetaResultChip outcome="loss" gamesWon={1} gamesLost={2} />);
    expect(screen.getByText("Loss")).toBeInTheDocument();
    expect(screen.getByText("1-2")).toBeInTheDocument();
  });

  it("prints a shutout rather than dropping the zero", () => {
    render(<MetaResultChip outcome="win" gamesWon={2} gamesLost={0} />);
    expect(screen.getByText("2-0")).toBeInTheDocument();
  });

  it("leaves the score out when the source published only one side of it", () => {
    render(<MetaResultChip outcome="draw" gamesWon={1} gamesLost={null} />);
    expect(screen.getByText("Draw")).toBeInTheDocument();
    expect(screen.queryByText(/-/u)).not.toBeInTheDocument();
  });

  it("tints the outcome so a win and a loss are apart at a glance", () => {
    const { container } = render(<MetaResultChip outcome="win" />);
    expect(container.querySelector('[data-slot="meta-result-chip"]')?.className).toContain(
      "text-success",
    );
  });
});
