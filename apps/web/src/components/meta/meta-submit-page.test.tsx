import type { MetaEventSummary, Printing } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaSubmissionOutcome } from "@/hooks/use-meta-submissions";
import { stubPrinting } from "@/test/factories";

const captured = vi.hoisted(() => ({
  events: [] as MetaEventSummary[],
  printings: [] as Printing[],
  outcome: null as MetaSubmissionOutcome | null,
}));

const mutateAsync = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-meta", () => ({
  useMetaEvents: () => ({ data: { events: captured.events } }),
}));

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ allPrintings: captured.printings }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
}));

vi.mock("@/hooks/use-meta-submissions", () => ({
  useSubmitMetaDeck: () => ({ mutateAsync, isPending: false }),
}));

// The calendar popover has its own test; here the date only has to be typed.
vi.mock("@/components/ui/date-picker", () => ({
  DatePicker: ({ value, onChange }: { value?: string; onChange?: (iso: string) => void }) => (
    <input
      aria-label="Day it was played"
      value={value ?? ""}
      onChange={(event) => onChange?.(event.target.value)}
    />
  ),
}));

vi.mock("@/components/layout/page-top-bar", () => ({
  PageDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  PageTopBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarBack: () => null,
  PageTopBarButton: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
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
import { MetaSubmitPage } from "./meta-submit-page";

const DECK_TEXT = "MainDeck:\n3 Blade of the Exile\n";

const EVENT: MetaEventSummary = {
  id: "event-1",
  slug: "summoner-skirmish",
  name: "Summoner Skirmish",
  eventDate: "2026-08-15",
  format: "standard",
  playerCount: 64,
  organizer: "Rift Games Berlin",
  tier: "store",
  country: null,
  location: null,
  playerRowCount: 64,
  deckCount: 8,
  topFinishes: [],
};

beforeEach(() => {
  mutateAsync.mockReset();
  captured.events = [EVENT];
  captured.printings = [
    stubPrinting({ shortCode: "OGN-042", card: { name: "Blade of the Exile", slug: "OGN-042" } }),
  ];
  captured.outcome = { ok: true, result: { id: "sub-1", unresolvedNames: [] } };
  mutateAsync.mockImplementation(() => Promise.resolve(captured.outcome));
});

/** Fills the player and decklist fields every submission needs. */
async function fillDeckAndPlayer(deckText = DECK_TEXT): Promise<void> {
  await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
  await userEvent.type(screen.getByLabelText("The decklist"), deckText);
}

/** Picks an archived event from the tournament select. */
async function pickEvent(): Promise<void> {
  await userEvent.click(screen.getByLabelText("Tournament"));
  await userEvent.click(await screen.findByRole("option", { name: /Summoner Skirmish/u }));
}

describe("MetaSubmitPage", () => {
  it("submits against an event the archive already has", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      metaEventId: "event-1",
      proposedEvent: null,
      playerName: "Kira",
      rank: 1,
      rankIsTier: false,
      listStatus: "full",
      cards: [{ name: "Blade of the Exile", zone: "main", quantity: 3 }],
    });
  });

  it("preselects the event when the page was reached from one", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" />);
    expect(screen.getByText("Summoner Skirmish")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tournament")).not.toBeInTheDocument();

    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ metaEventId: "event-1" });
  });

  it("proposes a tournament the archive does not have", async () => {
    render(<MetaSubmitPage />);
    await userEvent.click(screen.getByRole("button", { name: /Tell us about it/u }));

    await userEvent.type(screen.getByLabelText("Tournament name"), "Rift Open Berlin");
    await userEvent.type(screen.getByLabelText("Day it was played"), "2026-08-15");
    await userEvent.click(screen.getByLabelText("Format"));
    await userEvent.click(await screen.findByRole("option", { name: "Standard" }));
    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      metaEventId: null,
      proposedEvent: {
        name: "Rift Open Berlin",
        eventDate: "2026-08-15",
        format: "standard",
        playerCount: null,
      },
    });
  });

  it("refuses to send without a tournament", async () => {
    render(<MetaSubmitPage />);
    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Pick the tournament this deck came from.")).toBeInTheDocument();
  });

  it("refuses to send without a decklist", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/Paste the decklist/u)).toBeInTheDocument();
  });

  it("names the lines the catalogue could not place when the list is checked", async () => {
    render(<MetaSubmitPage />);
    await userEvent.type(
      screen.getByLabelText("The decklist"),
      "MainDeck:\n2 Blade of Exyle\n3 Blade of the Exile\n",
    );
    await userEvent.click(screen.getByRole("button", { name: "Check the list" }));

    expect(screen.getByText("Blade of Exyle")).toBeInTheDocument();
  });

  it("shows the names the archive could not resolve, and what they block", async () => {
    captured.outcome = { ok: true, result: { id: "sub-1", unresolvedNames: ["Blade of Exyle"] } };
    render(<MetaSubmitPage />);
    await pickEvent();
    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(screen.getByText(/couldn't place one of your cards/u)).toBeInTheDocument();
    expect(screen.getByText("Blade of Exyle")).toBeInTheDocument();
    expect(screen.getByText(/Send the list again with the spelling fixed/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fix the list and send again" })).toBeInTheDocument();
  });

  it("confirms a clean submission without warning about anything", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(screen.getByText("Your decklist is with us")).toBeInTheDocument();
    expect(screen.queryByText(/couldn't place/u)).not.toBeInTheDocument();
  });

  it("keeps the form up and explains itself when the pending cap is hit", async () => {
    captured.outcome = {
      ok: false,
      refusal: "cap",
      message:
        "You already have 10 submissions awaiting review. Please wait until they are looked at.",
    };
    render(<MetaSubmitPage />);
    await pickEvent();
    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(screen.getByText(/10 submissions awaiting review/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send the decklist" })).toBeInTheDocument();
  });

  it("offers only the two completeness choices a submission can carry", () => {
    render(<MetaSubmitPage />);
    expect(screen.getByRole("radio", { name: /The whole deck/u })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Main deck only/u })).toBeInTheDocument();
    // A submission always carries a list, so there is no standings-only option.
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("sends a partial list as one", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await userEvent.click(screen.getByRole("radio", { name: /Main deck only/u }));
    await fillDeckAndPlayer();
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ listStatus: "partial" });
  });

  it("sends the match record as separate counts", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await fillDeckAndPlayer();
    await userEvent.type(screen.getByLabelText("Wins"), "5");
    await userEvent.type(screen.getByLabelText("Losses"), "1");
    await userEvent.type(screen.getByLabelText("Draws"), "2");
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ wins: 5, losses: 1, draws: 2 });
  });

  it("sends a bracket-only finish as a tier rather than a placing", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await fillDeckAndPlayer();
    await userEvent.clear(screen.getByLabelText("Where they finished"));
    await userEvent.type(screen.getByLabelText("Where they finished"), "8");
    await userEvent.click(screen.getByRole("checkbox", { name: /Only the bracket is known/u }));
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ rank: 8, rankIsTier: true });
  });

  it("refuses half a match record rather than losing what was typed", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await fillDeckAndPlayer();
    await userEvent.type(screen.getByLabelText("Wins"), "5");
    await userEvent.click(screen.getByRole("button", { name: "Send the decklist" }));

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/both wins and losses/u)).toBeInTheDocument();
  });
});
