import type { MetaSubmission } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  items: [] as MetaSubmission[],
  isPending: false,
  hasNextPage: false,
}));

const fetchNextPage = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-meta-submissions", () => ({
  useMetaSubmissions: () => ({
    data: { pages: [{ items: captured.items, nextCursor: null }] },
    isPending: captured.isPending,
    hasNextPage: captured.hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
  }),
}));

// Page chrome pulls the router; the rows are what these tests are about.
vi.mock("@/components/layout/page-top-bar", () => ({
  PageDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  PageTopBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarBack: () => null,
  PageTopBarPrimaryButton: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  PageTopBarSticky: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarTitle: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children?: ReactNode; className?: string }) => (
    <a href="/meta" className={className}>
      {children}
    </a>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaSubmissionsPage } from "./meta-submissions-page";

/** @returns One ledger row, pending against a named event unless overridden. */
function submission(overrides: Partial<MetaSubmission> = {}): MetaSubmission {
  return {
    id: "sub-1",
    eventName: "Summoner Skirmish",
    playerName: "Kira",
    kind: "new_list",
    note: null,
    status: "pending",
    resolutionReason: null,
    resolutionNote: null,
    acceptedDeckToken: null,
    createdAt: "2026-08-15T10:00:00.000Z",
    resolvedAt: null,
    ...overrides,
  };
}

/** Renders the ledger for the given rows. */
function renderLedger(items: MetaSubmission[]): void {
  captured.items = items;
  render(<MetaSubmissionsPage />);
}

beforeEach(() => {
  fetchNextPage.mockReset();
  captured.items = [];
  captured.isPending = false;
  captured.hasNextPage = false;
});

describe("MetaSubmissionsPage", () => {
  it("invites a first contribution when nothing has been sent", () => {
    renderLedger([]);
    expect(screen.getByText("Nothing sent in yet")).toBeInTheDocument();
  });

  it("names the event and the player on every row", () => {
    renderLedger([submission()]);
    expect(screen.getByText("Summoner Skirmish")).toBeInTheDocument();
    expect(screen.getByText("Kira")).toBeInTheDocument();
    expect(screen.getByText("Sent 2026-08-15")).toBeInTheDocument();
  });

  it("shows a pending row as waiting, with what to expect", () => {
    renderLedger([submission()]);
    expect(screen.getByText("Waiting for review")).toBeInTheDocument();
    expect(screen.getByText(/reads everything sent in by hand/u)).toBeInTheDocument();
  });

  it("shows an accepted row and when it was reviewed", () => {
    renderLedger([
      submission({
        status: "accepted",
        acceptedDeckToken: "abc123",
        resolvedAt: "2026-08-17T09:00:00.000Z",
      }),
    ]);
    expect(screen.getByText("Added to the archive")).toBeInTheDocument();
    expect(screen.getByText(/Reviewed 2026-08-17/u)).toBeInTheDocument();
  });

  it("shows an already-correct row", () => {
    renderLedger([submission({ status: "already_correct", resolutionReason: "already_correct" })]);
    expect(screen.getByText("Already there")).toBeInTheDocument();
    expect(screen.getByText("The archive already had this.")).toBeInTheDocument();
  });

  it("shows a not-applied row with its canned reason", () => {
    renderLedger([submission({ status: "not_applied", resolutionReason: "unverified" })]);
    expect(screen.getByText("Not used")).toBeInTheDocument();
    expect(
      screen.getByText(/could not confirm this against a published result/u),
    ).toBeInTheDocument();
  });

  it("shows a rejected row the same way, without naming the split", () => {
    renderLedger([submission({ status: "rejected", resolutionReason: "not_an_event" })]);
    expect(screen.getByText("Not used")).toBeInTheDocument();
    expect(screen.getByText("We could not find a tournament behind this.")).toBeInTheDocument();
  });

  it("prefers the reviewer's own words over the canned reason", () => {
    renderLedger([
      submission({
        status: "not_applied",
        resolutionReason: "unverified",
        resolutionNote: "Send the standings link and I'll take another look.",
      }),
    ]);
    expect(
      screen.getByText("Send the standings link and I'll take another look."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/could not confirm/u)).not.toBeInTheDocument();
  });

  it("repeats the contributor's own note back to them", () => {
    renderLedger([submission({ note: "Taken from the finals stream." })]);
    expect(screen.getByText("Taken from the finals stream.")).toBeInTheDocument();
  });

  it("links to the archived deck once one exists", () => {
    renderLedger([submission({ status: "accepted", acceptedDeckToken: "abc123" })]);
    expect(screen.getByText("See the deck on the archive")).toBeInTheDocument();
  });

  it("offers no deck link while a row is still pending", () => {
    renderLedger([submission()]);
    expect(screen.queryByText("See the deck on the archive")).not.toBeInTheDocument();
  });

  it("says which of the three each row asked for", () => {
    renderLedger([submission({ id: "sub-2", kind: "completion" })]);
    expect(screen.getByText("Completion")).toBeInTheDocument();
  });

  it("names no player on a correction to the tournament's own facts", () => {
    renderLedger([submission({ id: "sub-3", kind: "event_correction", playerName: null })]);
    expect(screen.getByText("Event correction")).toBeInTheDocument();
    expect(screen.queryByText("Kira")).not.toBeInTheDocument();
  });
});
