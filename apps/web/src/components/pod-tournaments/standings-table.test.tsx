import type { PodStandingRow } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StandingsTable } from "./standings-table";

function makeRow(playerId: string, overrides: Partial<PodStandingRow> = {}): PodStandingRow {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    status: "active",
    droppedAfterRound: null,
    teamId: null,
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

function tableRows(): HTMLElement[] {
  return within(screen.getByRole("table")).getAllByRole("row").slice(1);
}

function tableRanks(): (string | undefined)[] {
  return tableRows().map((row) => within(row).getAllByRole("cell")[0]!.textContent?.trim());
}

describe("StandingsTable", () => {
  it("tells an empty field apart from a scoreless one", () => {
    render(<StandingsTable standings={[]} />);
    expect(screen.getByText("No players yet.")).toBeInTheDocument();
  });

  it("medals the top three and numbers the rest", () => {
    render(
      <StandingsTable
        standings={[
          makeRow("a", { score: 9 }),
          makeRow("b", { score: 6 }),
          makeRow("c", { score: 3 }),
          makeRow("d", { score: 1 }),
        ]}
      />,
    );
    expect(tableRanks()).toEqual(["1", "2", "3", "4"]);
    const medalled = tableRows().map(
      (row) => within(row).getAllByRole("cell")[0]!.querySelector("[data-slot=medal]") !== null,
    );
    expect(medalled).toEqual([true, true, true, false]);
  });

  it("gives both players level on points the same rank and skips the next", () => {
    render(
      <StandingsTable
        standings={[
          makeRow("a", { score: 9 }),
          makeRow("b", { score: 9 }),
          makeRow("c", { score: 3 }),
        ]}
      />,
    );
    expect(tableRanks()).toEqual(["1", "1", "3"]);
  });

  it("shows each player's name and region alongside their face", () => {
    render(
      <StandingsTable
        standings={[makeRow("a", { displayName: "Ezreal", region: "emea" })]}
        regionsEnabled
        regionLabel={(slug) => slug.toUpperCase()}
      />,
    );
    const [row] = tableRows();
    expect(within(row!).getByText("Ezreal")).toBeInTheDocument();
    expect(within(row!).getByText("EMEA")).toBeInTheDocument();
  });

  it("leaves the region off when the tournament doesn't use regions", () => {
    render(<StandingsTable standings={[makeRow("a", { region: "emea" })]} />);
    expect(within(screen.getByRole("table")).queryByText("emea")).not.toBeInTheDocument();
  });

  it("marks dropped players", () => {
    render(<StandingsTable standings={[makeRow("a", { status: "dropped" })]} />);
    expect(within(tableRows()[0]!).getByText("(dropped)")).toBeInTheDocument();
  });

  it("carries the pod-only columns in the pod variant", () => {
    render(<StandingsTable standings={[makeRow("a")]} variant="pod" />);
    expect(screen.getByRole("columnheader", { name: "Score" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Pod wins" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "3-pods" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "4-pods" })).toBeInTheDocument();
  });

  it("swaps the pod columns for the Swiss record in the Swiss variant", () => {
    render(<StandingsTable standings={[makeRow("a")]} variant="swiss" />);
    expect(screen.getByRole("columnheader", { name: "Points" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "W-L-D" })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "3-pods" })).not.toBeInTheDocument();
  });

  it("spells out the cryptic headers on hover", () => {
    render(<StandingsTable standings={[makeRow("a")]} />);
    expect(screen.getByRole("columnheader", { name: "Opp" })).toHaveAttribute(
      "title",
      "Average opponent points",
    );
    expect(screen.getByRole("columnheader", { name: "Game" })).toHaveAttribute(
      "title",
      "Game points",
    );
  });

  it("keeps the tie-break chain and a medal on the mobile list", () => {
    const { container } = render(
      <StandingsTable
        standings={[
          makeRow("a", {
            displayName: "Ezreal",
            score: 6,
            podWins: 2,
            avgOpponentScore: 1.75,
            gamePoints: 12,
          }),
        ]}
      />,
    );
    const mobile = container.querySelector(String.raw`ul.sm\:hidden`);
    expect(mobile).not.toBeNull();
    const item = within(mobile as HTMLElement);
    expect(item.getByText("Ezreal")).toBeInTheDocument();
    expect(item.getByText("1")).toBeInTheDocument();
    expect(item.getByText("2 pod wins")).toBeInTheDocument();
    expect(item.getByText("opp 1.75")).toBeInTheDocument();
    expect(item.getByText("12 game pts")).toBeInTheDocument();
    expect(item.getByText("6")).toBeInTheDocument();
  });

  it("shows the Swiss record instead of a win count on the mobile list", () => {
    const { container } = render(
      <StandingsTable
        standings={[makeRow("a", { wins: 3, losses: 1, draws: 0 })]}
        variant="swiss"
      />,
    );
    const mobile = container.querySelector(String.raw`ul.sm\:hidden`) as HTMLElement;
    expect(within(mobile).getByText("3-1-0")).toBeInTheDocument();
  });
});
