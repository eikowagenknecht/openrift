import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MetaPlayerRound } from "@/lib/meta-player-run";

import { MetaRunStrip, runStripLabel } from "./meta-run-strip";

function round(overrides: Partial<MetaPlayerRound> = {}): MetaPlayerRound {
  return {
    phaseOrder: 1,
    roundNumber: 1,
    isCut: false,
    tableNumber: null,
    outcome: "win",
    gamesWon: 2,
    gamesLost: 0,
    opponentId: "p-2",
    ...overrides,
  };
}

const SWISS_THEN_CUT = [
  round({ roundNumber: 1, outcome: "bye" }),
  round({ roundNumber: 2, outcome: "win" }),
  round({ roundNumber: 3, outcome: "loss" }),
  round({ roundNumber: 4, outcome: "win" }),
  round({ phaseOrder: 2, roundNumber: 1, isCut: true, outcome: "win" }),
  round({ phaseOrder: 2, roundNumber: 2, isCut: true, outcome: "win" }),
];

describe("runStripLabel", () => {
  it("reads the Swiss rounds and the cut as two runs of words", () => {
    expect(runStripLabel(SWISS_THEN_CUT)).toBe(
      "Round by round: bye, win, loss, win, then the cut: win, win",
    );
  });

  it("names no cut for an event that ended in the Swiss rounds", () => {
    expect(runStripLabel(SWISS_THEN_CUT.slice(0, 4))).toBe("Round by round: bye, win, loss, win");
  });

  it("names the cut alone when the source filed only its bracket", () => {
    expect(runStripLabel(SWISS_THEN_CUT.slice(4))).toBe("The cut: win, win");
  });

  it("reads a drawn round and one the source left undecided", () => {
    expect(
      runStripLabel([round({ outcome: "draw" }), round({ roundNumber: 2, outcome: "unknown" })]),
    ).toBe("Round by round: draw, no result");
  });

  it("says nothing for a player with no rounds", () => {
    expect(runStripLabel([])).toBe("");
  });
});

describe("MetaRunStrip", () => {
  function squares(): HTMLElement[] {
    return [...screen.getByRole("img").querySelectorAll("[title]")] as HTMLElement[];
  }

  it("paints one square per round, in play order", () => {
    render(<MetaRunStrip rounds={SWISS_THEN_CUT} />);

    const classes = squares().map((square) => square.className);
    expect(classes).toHaveLength(6);
    expect(classes[0]).toContain("ring-muted-foreground/45");
    expect(classes[1]).toContain("bg-success");
    expect(classes[2]).toContain("bg-destructive");
    expect(classes[4]).toContain("bg-success");
  });

  it("greys a drawn round apart from a win and a loss", () => {
    render(<MetaRunStrip rounds={[round({ outcome: "draw" })]} />);
    expect(squares()[0]?.className).toContain("bg-muted-foreground/45");
  });

  it("names each round in its own tooltip, the cut rounds apart", () => {
    render(<MetaRunStrip rounds={SWISS_THEN_CUT} />);

    const titles = squares().map((square) => square.getAttribute("title"));
    expect(titles).toEqual([
      "Round 1",
      "Round 2",
      "Round 3",
      "Round 4",
      "Cut round 1",
      "Cut round 2",
    ]);
  });

  it("splits the cut off from the Swiss rounds with a gap", () => {
    const { container } = render(<MetaRunStrip rounds={SWISS_THEN_CUT} />);
    expect(container.querySelectorAll("span.w-1")).toHaveLength(1);
  });

  it("opens no gap for an event whose rounds are all Swiss", () => {
    const { container } = render(<MetaRunStrip rounds={SWISS_THEN_CUT.slice(0, 4)} />);
    expect(container.querySelectorAll("span.w-1")).toHaveLength(0);
  });

  it("opens no gap for a run that starts in the cut", () => {
    const { container } = render(<MetaRunStrip rounds={SWISS_THEN_CUT.slice(4)} />);
    expect(container.querySelectorAll("span.w-1")).toHaveLength(0);
  });

  it("renders nothing for a player with no rounds", () => {
    const { container } = render(<MetaRunStrip rounds={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
