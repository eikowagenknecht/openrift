import type { PodStandingRow } from "@openrift/shared/types/api/pod-tournament";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { RegionOverview } from "./region-overview";

function makeRow(playerId: string, region: string | null, score: number): PodStandingRow {
  return {
    playerId,
    displayName: `Player ${playerId}`,
    status: "active",
    droppedAfterRound: null,
    teamId: null,
    score,
    gamePoints: 0,
    roundsPlayed: 1,
    pods3Count: 0,
    pods4Count: 0,
    byeCount: 0,
    podWins: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    region,
    avgOpponentScore: 0,
    avgOpponentGamePoints: 0,
  };
}

function barWidths(): (string | undefined)[] {
  return screen
    .getAllByRole("listitem")
    .map((item) => (item.querySelector("[style*='width']") as HTMLElement | null)?.style.width);
}

describe("RegionOverview", () => {
  it("renders nothing when no player has a region", () => {
    const { container } = render(<RegionOverview standings={[makeRow("a", null, 9)]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("scales every bar off the leading region", () => {
    render(
      <RegionOverview
        standings={[makeRow("a", "emea", 8), makeRow("b", "na", 4), makeRow("c", "apac", 2)]}
      />,
    );
    expect(barWidths()).toEqual(["100%", "50%", "25%"]);
  });

  it("shows each region's average and player count", () => {
    render(
      <RegionOverview
        standings={[makeRow("a", "emea", 9), makeRow("b", "emea", 6), makeRow("c", "na", 3)]}
        regionLabel={(slug) => slug.toUpperCase()}
      />,
    );
    const [top] = screen.getAllByRole("listitem");
    expect(within(top!).getByText("EMEA")).toBeInTheDocument();
    expect(within(top!).getByText("7.5")).toBeInTheDocument();
    expect(within(top!).getByText(/2 players/u)).toBeInTheDocument();
  });

  it("leaves the tracks empty before anyone has scored", () => {
    render(<RegionOverview standings={[makeRow("a", "emea", 0), makeRow("b", "na", 0)]} />);
    expect(barWidths()).toEqual(["0%", "0%"]);
  });

  it("keeps the note about players without a region", () => {
    render(<RegionOverview standings={[makeRow("a", "emea", 9), makeRow("b", null, 3)]} />);
    expect(screen.getByText("1 player without a region.")).toBeInTheDocument();
  });
});
