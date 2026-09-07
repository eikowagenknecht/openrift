import type {
  TournamentDetailResponse,
  TournamentViewerRole,
} from "@openrift/shared/types/api/tournament";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TournamentDeckCheckTab } from "./tournament-deck-check-tab";

const NOTICE = "Deck check is for judges. Ask an organizer to add you.";

// The real entries list runs a suspense query and the ingest guide pulls in
// server wiring; stub both so we can assert which branch the tab renders.
vi.mock("@/components/deck-check/deck-check-event-page", () => ({
  TournamentDeckCheckEntries: () => <div>entries-list</div>,
}));
vi.mock("@/components/deck-check/deck-check-ingest-guide", () => ({
  DeckCheckIngestGuide: () => <div>ingest-guide</div>,
}));

function detailWith(myRoles: TournamentViewerRole[]): TournamentDetailResponse {
  return {
    id: "tournament-1",
    deckSubmission: "required",
    host: { type: "user", id: "user-1", name: "Host" },
    myRoles,
  } as unknown as TournamentDetailResponse;
}

describe("TournamentDeckCheckTab", () => {
  it("shows a notice and no entries list for a non-judge", () => {
    render(<TournamentDeckCheckTab detail={detailWith([])} />);

    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.queryByText("entries-list")).not.toBeInTheDocument();
  });

  it("renders the entries list for a judge", () => {
    render(<TournamentDeckCheckTab detail={detailWith(["judge"])} />);

    expect(screen.getByText("entries-list")).toBeInTheDocument();
    expect(screen.queryByText(NOTICE)).not.toBeInTheDocument();
  });

  it("renders the entries list for a host or organizer", () => {
    render(<TournamentDeckCheckTab detail={detailWith(["organizer"])} />);

    expect(screen.getByText("entries-list")).toBeInTheDocument();
  });
});
