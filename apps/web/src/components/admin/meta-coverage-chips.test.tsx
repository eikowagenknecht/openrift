import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { MetaCoverageRow } from "./meta-coverage-chips";
import { MetaCoverageChips } from "./meta-coverage-chips";

const NOW = new Date("2026-08-29T12:00:00.000Z");

function row(overrides: Partial<MetaCoverageRow> = {}): MetaCoverageRow {
  return {
    triage: "accepted",
    displayStatus: "complete",
    decklistStatus: "PUBLISHED",
    startAt: "2026-08-15T18:00:00.000Z",
    fetchedAt: "2026-08-16T02:00:00.000Z",
    stagedPlayerCount: 64,
    stagedLegendCount: 60,
    stagedDeckCount: 12,
    nextCheckAt: null,
    ...overrides,
  };
}

describe("MetaCoverageChips", () => {
  it("draws nothing for a row nothing has been fetched for", () => {
    const { container } = render(<MetaCoverageChips row={row({ triage: "new" })} now={NOW} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("counts what the last fetch staged", () => {
    render(<MetaCoverageChips row={row()} now={NOW} />);
    expect(screen.getByText("64 standings")).toBeInTheDocument();
    expect(screen.getByText("60 legends")).toBeInTheDocument();
    expect(screen.getByText("12 decks")).toBeInTheDocument();
  });

  it("calls the standings pending until a fetch has landed", () => {
    render(
      <MetaCoverageChips
        row={row({ fetchedAt: null, stagedPlayerCount: 0, stagedDeckCount: 0 })}
        now={NOW}
      />,
    );
    expect(screen.getByText("Standings pending")).toBeInTheDocument();
    expect(screen.queryByText(/legends/u)).not.toBeInTheDocument();
    expect(screen.getByText("Decks pending")).toBeInTheDocument();
  });

  it("separates decks the source never published from decks still to come", () => {
    render(<MetaCoverageChips row={row({ decklistStatus: null, stagedDeckCount: 0 })} now={NOW} />);
    expect(screen.getByText("No decklists")).toBeInTheDocument();
  });

  it("says the legends are missing once the fetch has been and found none", () => {
    render(<MetaCoverageChips row={row({ stagedLegendCount: 0 })} now={NOW} />);
    expect(screen.getByText("No legends")).toBeInTheDocument();
  });

  it("says the ladder is exhausted when no further visit is scheduled", () => {
    render(<MetaCoverageChips row={row()} now={NOW} />);
    expect(screen.getByText("ladder done")).toBeInTheDocument();
  });

  it("counts down to an accepted event that has not started", () => {
    render(
      <MetaCoverageChips
        row={row({
          startAt: "2026-08-31T12:00:00.000Z",
          displayStatus: "upcoming",
          nextCheckAt: "2026-08-31T13:00:00.000Z",
        })}
        now={NOW}
      />,
    );
    expect(screen.getByText("starts in 2d")).toBeInTheDocument();
  });

  it("watches an event that is under way hourly", () => {
    render(
      <MetaCoverageChips
        row={row({ displayStatus: "inProgress", nextCheckAt: "2026-08-29T13:00:00.000Z" })}
        now={NOW}
      />,
    );
    expect(screen.getByText("watching hourly")).toBeInTheDocument();
  });

  it("names the next visit on a finished event still on the ladder", () => {
    render(<MetaCoverageChips row={row({ nextCheckAt: "2026-08-30T12:00:00.000Z" })} now={NOW} />);
    expect(screen.getByText("next check in 1d")).toBeInTheDocument();
  });
});
