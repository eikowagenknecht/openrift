import type {
  MetaEventDetail,
  MetaEventMatch,
  MetaEventPhase,
  MetaEventPlayer,
} from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metaEvent, metaMatch, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

const captured = vi.hoisted(() => ({
  event: null as MetaEventDetail | null,
  players: [] as MetaEventPlayer[],
  matches: [] as MetaEventMatch[],
  phases: [] as MetaEventPhase[],
  userId: null as string | null,
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaEvent: () => ({
    data: {
      event: captured.event,
      players: captured.players,
      matches: captured.matches,
      phases: captured.phases,
    },
  }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({ labels: { freeform: "Freeform" } }),
  useEnumOrders: () => ({ orders: { domains: ["fury"] }, labels: { domains: { fury: "Fury" } } }),
}));

vi.mock("@/lib/auth-session", () => ({ useUserId: () => captured.userId }));

vi.mock("@/components/layout/page-top-bar", () => ({
  PageTopBar: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarActions: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarPrimaryButton: ({
    children,
    render: node,
  }: {
    children?: ReactNode;
    render?: ReactNode;
  }) => (
    <span data-slot="top-bar-cta">
      {isValidElement(node) ? cloneElement(node as ReactElement, {}, children) : children}
    </span>
  ),
  PageTopBarIconButton: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  PageTopBarSticky: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PageTopBarTitle: ({ children }: { children?: ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@/components/ui/dropdown-menu", () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/meta/meta-event-correction-dialog", () => ({
  MetaEventCorrectionDialog: () => null,
}));

vi.mock("@/components/meta/meta-event-deck-preview", () => ({
  MetaEventDeckPreview: () => null,
  MetaEventDeckPreviewSkeleton: () => null,
}));

vi.mock("@/components/cards/card-detail-opener", () => ({
  CardDetailOverlayProvider: ({ children }: { children?: ReactNode }) => children,
}));

vi.mock("@/components/meta/meta-deck-costs-bridge", () => ({
  MetaDeckCostsBridge: () => null,
}));

vi.mock("@/components/layout/top-bar-breadcrumb", () => ({
  TopBarBreadcrumbSeparator: () => null,
  TopBarBreadcrumbTrail: () => null,
}));

vi.mock("@/components/markdown-text", () => ({
  MarkdownText: ({ text }: { text: string }) => <p>{text}</p>,
}));

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink };
});

const { MetaEventPage } = await import("./meta-event-page");

function renderPage(
  overrides: Partial<MetaEventDetail> = {},
  players: MetaEventPlayer[] = [],
  matches: MetaEventMatch[] = [],
  phases: MetaEventPhase[] = [],
): void {
  captured.event = metaEvent({
    playerRowCount: players.length,
    deckCount: players.filter((row) => row.deckId !== null).length,
    ...overrides,
  });
  captured.players = players;
  captured.matches = matches;
  captured.phases = phases;
  render(<MetaEventPage slug="summoner-skirmish" />);
}

function ctaHref(label: string): string | null {
  return screen.getByText(label).closest("a")?.getAttribute("href") ?? null;
}

describe("MetaEventPage", () => {
  beforeEach(() => {
    captured.event = null;
    captured.players = [];
    captured.matches = [];
    captured.phases = [];
    captured.userId = null;
  });

  it("titles the page with the event and says what it counts for", () => {
    renderPage({ tier: "premier" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Summoner Skirmish" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Premier")).toBeInTheDocument();
  });

  it("offers a signed-in reader the submission form for this event", () => {
    captured.userId = "user-1";
    renderPage({}, [metaPlayer()]);
    expect(ctaHref("Add a decklist")).toBe("/meta/summoner-skirmish/submit");
  });

  it("tells a logged-out reader that signing in is what stands in the way", () => {
    renderPage({}, [metaPlayer()]);
    expect(screen.getByText("Sign in to add a decklist")).toBeInTheDocument();
    expect(ctaHref("Sign in to add a decklist")).toBe(
      "/login?redirect=%2Fmeta%2Fsummoner-skirmish%2Fsubmit",
    );
  });

  it("keeps the top bar to the breadcrumb and the overflow menu", () => {
    captured.userId = "user-1";
    renderPage({}, [metaPlayer()]);
    expect(document.querySelector('[data-slot="top-bar-cta"]')).toBeNull();
  });

  it("offers a signed-in reader a way to correct the tournament's own facts", () => {
    captured.userId = "user-1";
    renderPage();
    expect(screen.getByText("Suggest a correction")).toBeInTheDocument();
  });

  it("hides the correction menu from a logged-out reader, whose only item is a dead end", () => {
    renderPage();
    expect(screen.queryByText("Suggest a correction")).not.toBeInTheDocument();
  });

  it("renders the admin's notes when the event carries any", () => {
    renderPage({ notes: "Played on the new floor." });
    expect(screen.getByText("Played on the new floor.")).toBeInTheDocument();
  });

  it("reads top-down: the hero, the field, then the ask", () => {
    renderPage({}, [
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1, shareToken: "tok1", deckId: "d1" }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);

    const headings = screen
      .getAllByRole("heading")
      .map((node) => node.textContent)
      .filter((text) => text !== null);
    expect(headings[0]).toBe("Summoner Skirmish");
    expect(headings.at(-1)).toBe("Standings");

    const standings = screen.getByRole("heading", { name: "Standings" });
    const ask = screen.getByText("Were you at Summoner Skirmish?");
    expect(standings.compareDocumentPosition(ask)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("names the champion above the field", () => {
    renderPage({}, [
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1 }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);
    expect(screen.getByText("Champion")).toBeInTheDocument();
  });

  it("stands the bracket down for an event with no archived pairings", () => {
    renderPage({}, [metaPlayer()]);
    expect(screen.queryByRole("heading", { name: /^Top \d+$/u })).toBeNull();
  });

  it("shows the cut when the archive holds one", () => {
    const players = ["Ana", "Bo", "Cy", "Dee"].map((playerName, index) =>
      metaPlayer({ id: `p-${index + 1}`, playerName, rank: index + 1 }),
    );
    renderPage(
      {},
      players,
      [
        metaMatch({ roundNumber: 1, tableNumber: 1, player1Id: "p-1", player2Id: "p-4" }),
        metaMatch({ roundNumber: 1, tableNumber: 2, player1Id: "p-2", player2Id: "p-3" }),
        metaMatch({ roundNumber: 2, tableNumber: 1, player1Id: "p-1", player2Id: "p-2" }),
      ],
      [metaPhase({ rankRequired: 4 })],
    );

    expect(screen.getByRole("heading", { name: "Top 4" })).toBeInTheDocument();
  });

  it("still reads as a finished page when the archive holds nothing but the event", () => {
    renderPage({}, []);
    expect(screen.getByText("No standings on file for this event yet.")).toBeInTheDocument();
    expect(screen.queryByText("Were you at Summoner Skirmish?")).toBeNull();
  });

  it("leads on to the rest of the archive", () => {
    renderPage();
    expect(
      screen.getByRole("link", { name: "Browse every archived deck" }).getAttribute("href"),
    ).toBe("/meta/decks");
  });
});
