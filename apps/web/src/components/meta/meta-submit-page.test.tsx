import type { MetaEventSummary, Printing } from "@openrift/shared";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

const LEGEND_CARD_ID = "card-wandering-ronin";

const MAIN_ONLY = "MainDeck:\n3 Blade of the Exile\n";

const FULL_DECK = [
  "Legend:",
  "1 Wandering Ronin",
  "",
  "MainDeck:",
  "3 Blade of the Exile",
  "",
  "Battlefields:",
  "1 Ionian Cliffside",
  "",
  "Runes:",
  "1 Fury Rune",
  "",
].join("\n");

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

const ROW_PREFILL = {
  playerName: "Kira",
  rank: 3,
  wins: 5,
  losses: 1,
  draws: 0,
};

beforeEach(() => {
  mutateAsync.mockReset();
  captured.events = [EVENT];
  captured.printings = [
    stubPrinting({
      cardId: LEGEND_CARD_ID,
      shortCode: "OGN-001",
      card: { name: "Wandering Ronin", slug: "OGN-001" },
    }),
    stubPrinting({ shortCode: "OGN-042", card: { name: "Blade of the Exile", slug: "OGN-042" } }),
    stubPrinting({ shortCode: "OGN-101", card: { name: "Ionian Cliffside", slug: "OGN-101" } }),
    stubPrinting({ shortCode: "OGN-201", card: { name: "Fury Rune", slug: "OGN-201" } }),
  ];
  captured.outcome = { ok: true, result: { id: "sub-1", unresolvedNames: [] } };
  mutateAsync.mockImplementation(() => Promise.resolve(captured.outcome));
});

async function pasteDeck(text: string): Promise<void> {
  fireEvent.change(screen.getByLabelText("Decklist"), { target: { value: text } });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Send decklist" })).toBeEnabled();
  });
}

/** Picks an archived event from the tournament select. */
async function pickEvent(): Promise<void> {
  await userEvent.click(screen.getByLabelText("Tournament"));
  await userEvent.click(await screen.findByRole("option", { name: /Summoner Skirmish/u }));
}

function send(): Promise<void> {
  return userEvent.click(screen.getByRole("button", { name: "Send decklist" }));
}

describe("MetaSubmitPage from a standings row", () => {
  it("shows the row read-only and asks for nothing but the paste", () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);

    expect(screen.getByText("Summoner Skirmish")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-15 · Standard · 64 players/u)).toBeInTheDocument();
    expect(screen.getByText("Kira")).toBeInTheDocument();
    expect(screen.getByText("#3")).toBeInTheDocument();
    expect(screen.getByText("5-1-0")).toBeInTheDocument();
    expect(screen.queryByLabelText("Who played it")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Where they finished")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tournament")).not.toBeInTheDocument();
    expect(screen.queryByText(/A different tournament/u)).not.toBeInTheDocument();
  });

  it("prints a bracket-only finish as its tier", () => {
    render(
      <MetaSubmitPage
        slug="summoner-skirmish"
        prefill={{ ...ROW_PREFILL, rank: 8, rankIsTier: true }}
      />,
    );

    expect(screen.getByText("T8")).toBeInTheDocument();
  });

  it("names the legend the archive has for the row", () => {
    render(
      <MetaSubmitPage
        slug="summoner-skirmish"
        prefill={{ ...ROW_PREFILL, legendName: "Wandering Ronin" }}
      />,
    );

    expect(screen.getByText("Legend Wandering Ronin")).toBeInTheDocument();
  });

  it("reads a whole deck back with its zone counts", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(FULL_DECK);

    expect(await screen.findByText("Whole deck")).toBeInTheDocument();
    expect(screen.getByText(/3 main · 1 battlefield · 1 rune/u)).toBeInTheDocument();
  });

  it("calls a main-deck-only paste partial and names what is missing", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(MAIN_ONLY);

    expect(await screen.findByText("Main deck only")).toBeInTheDocument();
    expect(screen.getByText(/3 main · 0 battlefields · 0 runes/u)).toBeInTheDocument();
    expect(screen.getByText(/No legend, battlefields or runes in the list/u)).toBeInTheDocument();
  });

  it("names only the runes when they are the one zone missing", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(FULL_DECK.replace("Runes:\n1 Fury Rune\n", ""));

    expect(await screen.findByText(/No runes in the list/u)).toBeInTheDocument();
    expect(screen.getByText(/Paste it too if you have it/u)).toBeInTheDocument();
  });

  it("flags a pasted legend that is not the one the standings hold", async () => {
    render(
      <MetaSubmitPage
        slug="summoner-skirmish"
        prefill={{ ...ROW_PREFILL, legendName: "Ahri", legendCardId: "card-ahri" }}
      />,
    );
    await pasteDeck(FULL_DECK);

    expect(
      await screen.findByText("This list's legend is Wandering Ronin, but the standings have Ahri"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Legend matches the standings.")).not.toBeInTheDocument();
  });

  it("says so plainly when the pasted legend matches the standings", async () => {
    render(
      <MetaSubmitPage
        slug="summoner-skirmish"
        prefill={{ ...ROW_PREFILL, legendName: "Wandering Ronin", legendCardId: LEGEND_CARD_ID }}
      />,
    );
    await pasteDeck(FULL_DECK);

    expect(await screen.findByText("Legend matches the standings.")).toBeInTheDocument();
    expect(screen.queryByText(/but the standings have/u)).not.toBeInTheDocument();
  });

  it("keeps the send button dead until a card parses", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    expect(screen.getByRole("button", { name: "Send decklist" })).toBeDisabled();

    await pasteDeck(MAIN_ONLY);
    expect(screen.getByRole("button", { name: "Send decklist" })).toBeEnabled();
  });

  it("sends the row's own facts and the status the paste implies", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(FULL_DECK);
    await send();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      metaEventId: "event-1",
      proposedEvent: null,
      playerName: "Kira",
      rank: 3,
      wins: 5,
      losses: 1,
      draws: 0,
      listStatus: "full",
    });
  });

  it("sends a main-deck-only paste as a partial list", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ listStatus: "partial" });
  });

  it("points back at the standings once the list is with us", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(FULL_DECK);
    await send();

    expect(screen.getByRole("link", { name: "Back to the standings" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send another" })).not.toBeInTheDocument();
  });
});

describe("MetaSubmitPage note", () => {
  it("keeps the note folded away for a new list", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);

    expect(screen.queryByLabelText("Note for the reviewer (optional)")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add a note for the reviewer" }));
    expect(screen.getByLabelText("Note for the reviewer (optional)")).toBeInTheDocument();
  });

  it("opens the note already, and asks the right question, for a correction", () => {
    render(
      <MetaSubmitPage
        slug="summoner-skirmish"
        prefill={{ ...ROW_PREFILL, kind: "correction", deckText: MAIN_ONLY }}
      />,
    );

    expect(screen.getByLabelText("What's wrong with the list we have")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add a note for the reviewer" }),
    ).not.toBeInTheDocument();
  });

  it("refuses a correction that says nothing about what is wrong", async () => {
    render(
      <MetaSubmitPage
        slug="summoner-skirmish"
        prefill={{ ...ROW_PREFILL, kind: "correction", deckText: MAIN_ONLY }}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Send decklist" })).toBeEnabled();
    });
    await send();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/Say what's wrong with the list we have/u)).toBeInTheDocument();
  });
});

describe("MetaSubmitPage without a standings row", () => {
  it("asks for the tournament and the player", () => {
    render(<MetaSubmitPage />);

    expect(screen.getByLabelText("Tournament")).toBeInTheDocument();
    expect(screen.getByLabelText("Who played it")).toBeInTheDocument();
    expect(screen.getByLabelText("Where they finished")).toBeInTheDocument();
  });

  it("keeps the player fields but fixes the tournament when opened from an event", () => {
    render(<MetaSubmitPage slug="summoner-skirmish" />);

    expect(screen.getByText("Summoner Skirmish")).toBeInTheDocument();
    expect(screen.getByText(/2026-08-15 · Standard · 64 players/u)).toBeInTheDocument();
    expect(screen.queryByLabelText("Tournament")).not.toBeInTheDocument();
    expect(screen.queryByText(/A different tournament/u)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Who played it")).toBeInTheDocument();
  });

  it("submits against an event the archive already has", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await pasteDeck(FULL_DECK);
    await send();

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      metaEventId: "event-1",
      proposedEvent: null,
      playerName: "Kira",
      rank: 1,
      rankIsTier: false,
      listStatus: "full",
      cards: expect.arrayContaining([{ name: "Blade of the Exile", zone: "main", quantity: 3 }]),
    });
  });

  it("proposes a tournament the archive does not have", async () => {
    render(<MetaSubmitPage />);
    await userEvent.click(screen.getByRole("button", { name: /Tell us about it/u }));

    await userEvent.type(screen.getByLabelText("Tournament name"), "Rift Open Berlin");
    await userEvent.type(screen.getByLabelText("Day it was played"), "2026-08-15");
    await userEvent.click(screen.getByLabelText("Format"));
    await userEvent.click(await screen.findByRole("option", { name: "Standard" }));
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await pasteDeck(MAIN_ONLY);
    await send();

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
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText("Pick the tournament this deck came from.")).toBeInTheDocument();
  });

  it("sends the match record as separate counts", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await userEvent.type(screen.getByLabelText("Wins"), "5");
    await userEvent.type(screen.getByLabelText("Losses"), "1");
    await userEvent.type(screen.getByLabelText("Draws"), "2");
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ wins: 5, losses: 1, draws: 2 });
  });

  it("sends a bracket-only finish as a tier rather than a placing", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await userEvent.clear(screen.getByLabelText("Where they finished"));
    await userEvent.type(screen.getByLabelText("Where they finished"), "8");
    await userEvent.click(screen.getByRole("checkbox", { name: /Only the bracket is known/u }));
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ rank: 8, rankIsTier: true });
  });

  it("refuses half a match record rather than losing what was typed", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await userEvent.type(screen.getByLabelText("Wins"), "5");
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(/both wins and losses/u)).toBeInTheDocument();
  });

  it("offers another submission once one is sent", async () => {
    render(<MetaSubmitPage />);
    await pickEvent();
    await userEvent.type(screen.getByLabelText("Who played it"), "Kira");
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(screen.getByText("Your decklist is with us")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send another" })).toBeInTheDocument();
  });
});

describe("MetaSubmitPage list problems", () => {
  it("names the lines the catalogue could not place as they are typed", async () => {
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck("MainDeck:\n2 Zaunite Sprocketwright\n3 Blade of the Exile\n");

    expect(await screen.findByText("Zaunite Sprocketwright")).toBeInTheDocument();
  });

  it("shows the names the archive could not resolve, and what they block", async () => {
    captured.outcome = { ok: true, result: { id: "sub-1", unresolvedNames: ["Blade of Exyle"] } };
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(screen.getByText(/couldn't place one of your cards/u)).toBeInTheDocument();
    expect(screen.getByText("Blade of Exyle")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fix the list and send again" })).toBeInTheDocument();
  });

  it("keeps the form up and explains itself when the pending cap is hit", async () => {
    captured.outcome = {
      ok: false,
      refusal: "cap",
      message:
        "You already have 10 submissions awaiting review. Please wait until they are looked at.",
    };
    render(<MetaSubmitPage slug="summoner-skirmish" prefill={ROW_PREFILL} />);
    await pasteDeck(MAIN_ONLY);
    await send();

    expect(screen.getByText(/10 submissions awaiting review/u)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send decklist" })).toBeInTheDocument();
  });
});
