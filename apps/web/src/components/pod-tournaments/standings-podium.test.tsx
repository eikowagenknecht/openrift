import type { PodStandingRow } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandingsPodium } from "./standings-podium";

function makeRow(playerId: string, overrides: Partial<PodStandingRow> = {}): PodStandingRow {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    status: "active",
    droppedAfterRound: null,
    score: 0,
    gamePoints: 0,
    roundsPlayed: 1,
    pods3Count: 0,
    pods4Count: 0,
    byeCount: 0,
    podWins: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    region: null,
    avgOpponentScore: 0,
    avgOpponentGamePoints: 0,
    ...overrides,
  };
}

describe("StandingsPodium", () => {
  it("seats the leader with their score and win count", () => {
    render(
      <StandingsPodium
        standings={[
          makeRow("a", { displayName: "Ezreal", score: 9, podWins: 3 }),
          makeRow("b", { displayName: "Lux", score: 6, podWins: 2 }),
          makeRow("c", { displayName: "Jinx", score: 3, podWins: 1 }),
        ]}
      />,
    );
    expect(screen.getByText("Ezreal")).toBeInTheDocument();
    expect(screen.getByText("9")).toBeInTheDocument();
    expect(screen.getByText("3 pod wins")).toBeInTheDocument();
    expect(screen.getByText("2 pod wins")).toBeInTheDocument();
  });

  it("seats at most the top three", () => {
    render(
      <StandingsPodium
        standings={[
          makeRow("a", { displayName: "Ezreal", score: 9 }),
          makeRow("b", { displayName: "Lux", score: 6 }),
          makeRow("c", { displayName: "Jinx", score: 3 }),
          makeRow("d", { displayName: "Yasuo", score: 1 }),
        ]}
      />,
    );
    expect(screen.queryByText("Yasuo")).not.toBeInTheDocument();
  });

  it("surfaces the tie-break that decided a tied top two", () => {
    render(
      <StandingsPodium
        standings={[
          makeRow("a", { displayName: "Ezreal", score: 6, podWins: 2, avgOpponentScore: 1.75 }),
          makeRow("b", { displayName: "Lux", score: 6, podWins: 2, avgOpponentScore: 1 }),
        ]}
      />,
    );
    expect(screen.getByText("2 pod wins · opp 1.75")).toBeInTheDocument();
    expect(screen.getByText("2 pod wins · opp 1")).toBeInTheDocument();
  });

  it("shows the Swiss record instead of a win count", () => {
    render(
      <StandingsPodium
        standings={[
          makeRow("a", { displayName: "Ezreal", score: 9, wins: 3, losses: 1, draws: 0 }),
        ]}
        variant="swiss"
      />,
    );
    expect(screen.getByText("3-1-0")).toBeInTheDocument();
  });

  it("renders the empty throne before the first round is finalized", () => {
    render(<StandingsPodium standings={[makeRow("a", { roundsPlayed: 0 })]} />);
    expect(screen.getByText("The throne fills after round 1 is finalized.")).toBeInTheDocument();
    expect(screen.queryByText("Player a")).not.toBeInTheDocument();
  });

  it("renders the empty throne when there are no players at all", () => {
    render(<StandingsPodium standings={[]} />);
    expect(screen.getByText("The throne fills after round 1 is finalized.")).toBeInTheDocument();
  });
});
