import type { MetaEventDetail, MetaEventPlayer, MetaEventSource } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  event: null as MetaEventDetail | null,
  players: [] as MetaEventPlayer[],
  userId: null as string | null,
}));

vi.mock("@/hooks/use-meta", () => ({
  useMetaEvent: () => ({ data: { event: captured.event, players: captured.players } }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({ labels: { freeform: "Freeform" } }),
}));

// The page's chrome and its deck rows pull the router and the catalog; neither
// is what these tests are about.
vi.mock("@/components/layout/page-top-bar", () => ({
  PageTopBar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarBack: () => null,
  PageTopBarSticky: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  PageTopBarTitle: ({ children }: { children?: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock("@/lib/auth-session", () => ({
  useUserId: () => captured.userId,
}));

vi.mock("@/components/meta/meta-deck-row", () => ({ MetaDeckRow: () => null }));
vi.mock("@/components/markdown-text", () => ({ MarkdownText: () => null }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children?: React.ReactNode;
    to?: string;
    params?: { slug?: string; token?: string; cardSlug?: string };
  }) => (
    <a
      href={(to ?? "/meta/decks")
        .replace("$cardSlug", params?.cardSlug ?? "")
        .replace("$slug", params?.slug ?? "")
        .replace("$token", params?.token ?? "")}
    >
      {children}
    </a>
  ),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaEventPage } from "./meta-event-page";

/** @returns One citation, a provider row with a URL unless overridden. */
function source(overrides: Partial<MetaEventSource> = {}): MetaEventSource {
  return {
    id: "src-1",
    provider: "uvsgames",
    externalId: "evt-1",
    label: "uvsgames",
    sourceUrl: "https://example.invalid/uvs",
    ...overrides,
  };
}

/** @returns One standings row, a deckless entry unless overridden. */
function player(overrides: Partial<MetaEventPlayer> = {}): MetaEventPlayer {
  return {
    id: "p-1",
    rank: 1,
    rankIsTier: false,
    playerName: "Ana",
    wins: 6,
    losses: 1,
    draws: null,
    legend: {
      cardId: "card-yasuo",
      name: "Yasuo, the Unforgiven",
      slug: "yasuo-the-unforgiven",
      imageId: null,
    },
    champion: null,
    deckId: null,
    deckName: null,
    shareToken: null,
    listStatus: "none",
    ...overrides,
  };
}

/** Renders the page for one event's sources, contributors, and standings. */
function renderEvent(
  overrides: Partial<MetaEventDetail> = {},
  players: MetaEventPlayer[] = [],
): void {
  captured.event = {
    id: "evt",
    slug: "summoner-skirmish",
    name: "Summoner Skirmish",
    eventDate: "2026-08-01",
    format: "freeform",
    playerCount: 64,
    organizer: "LGS Berlin",
    tier: "store",
    country: null,
    location: null,
    playerRowCount: players.length,
    deckCount: players.filter((row) => row.deckId !== null).length,
    notes: null,
    sources: [],
    contributors: [],
    ...overrides,
  };
  captured.players = players;
  render(<MetaEventPage slug="summoner-skirmish" />);
}

/** @returns The citation paragraph's full text, or null when there is none. */
function sourcesText(): string | null {
  return screen.queryByText(/^Sources?:/u)?.textContent ?? null;
}

describe("MetaEventPage sources", () => {
  beforeEach(() => {
    captured.event = null;
    captured.players = [];
    captured.userId = null;
  });

  it("renders nothing at all when the event has no citations", () => {
    renderEvent();
    expect(sourcesText()).toBeNull();
  });

  it("links a citation that carries a URL", () => {
    renderEvent({ sources: [source()] });

    const link = screen.getByRole("link", { name: /uvsgames/u });
    expect(link.getAttribute("href")).toBe("https://example.invalid/uvs");
    // noreferrer implies noopener, so the repo never writes both.
    expect(link.getAttribute("rel")).toBe("noreferrer");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("prints a hand-entered citation as plain text, not a dead link", () => {
    renderEvent({
      sources: [source({ provider: null, externalId: null, label: "Twitch VOD", sourceUrl: null })],
    });

    expect(sourcesText()).toContain("Twitch VOD");
    expect(screen.queryByRole("link", { name: /Twitch VOD/u })).toBeNull();
  });

  it("labels a single citation in the singular", () => {
    renderEvent({ sources: [source()] });
    expect(sourcesText()?.startsWith("Source:")).toBe(true);
  });

  it("lists every citation when several sources fed the event", () => {
    renderEvent({
      sources: [
        source(),
        source({ id: "src-2", provider: "playriftbound", label: "playriftbound" }),
        source({
          id: "src-3",
          provider: null,
          externalId: null,
          label: "Twitch VOD",
          sourceUrl: null,
        }),
      ],
    });

    const text = sourcesText();
    expect(text?.startsWith("Sources:")).toBe(true);
    // Attribution: none of the three is collapsed behind a "more" toggle.
    expect(text).toContain("uvsgames");
    expect(text).toContain("playriftbound");
    expect(text).toContain("Twitch VOD");
    expect(screen.getAllByRole("link", { name: /uvsgames|playriftbound/u })).toHaveLength(2);
  });
});

describe("MetaEventPage contributors", () => {
  beforeEach(() => {
    captured.event = null;
    captured.players = [];
    captured.userId = null;
  });

  /** @returns The contributor line's text, or null when there is none. */
  function line(): string | null {
    return screen.queryByText(/^Contributed by/u)?.textContent ?? null;
  }

  it("renders nothing when nobody is credited", () => {
    renderEvent({ contributors: [] });
    expect(line()).toBeNull();
  });

  // The truncation rule itself lives with the shared component that owns it —
  // see meta-contributors.test.tsx. These two pin the page's wiring: that the
  // line is fed from `contributors`, and that it renders in both regimes.
  it("names the contributors the payload carries", () => {
    renderEvent({ contributors: ["Alice", "Bob"] });
    expect(line()).toBe("Contributed by Alice and Bob");
  });

  it("collapses a long list rather than printing all of it", () => {
    renderEvent({ contributors: ["Alice", "Bob", "Carol", "Dan", "Erin"] });
    expect(line()).toBe("Contributed by Alice, Bob, Carol and 2 others");
  });

  it("credits nobody with a profile link", () => {
    renderEvent({ contributors: ["Alice", "Bob"] });
    expect(screen.queryByRole("link", { name: /Alice|Bob/u })).toBeNull();
  });
});

describe("MetaEventPage add-a-decklist", () => {
  beforeEach(() => {
    captured.event = null;
    captured.players = [];
    captured.userId = null;
  });

  it("offers a signed-in reader the submission form for this event", () => {
    captured.userId = "user-1";
    renderEvent();

    const cta = screen.getByRole("link", { name: /Add a decklist/u });
    expect(cta.getAttribute("href")).toBe("/meta/summoner-skirmish/submit");
  });

  it("tells a logged-out reader that signing in is what stands in the way", () => {
    renderEvent();

    // Not a bare CTA that dead-ends at a login screen with no reason given.
    expect(screen.queryByRole("link", { name: /Add a decklist/u })).toBeNull();
    expect(screen.getByText(/Know a list from this event\?/u)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Sign in to send it/u })).toBeInTheDocument();
  });

  it("offers the form even on an event with no decks yet", () => {
    captured.userId = "user-1";
    renderEvent({}, [player()]);

    expect(screen.getByRole("link", { name: /Add a decklist/u })).toBeInTheDocument();
    expect(screen.getByText(/haven|t archived any decks/u)).toBeInTheDocument();
  });
});

describe("MetaEventPage standings", () => {
  beforeEach(() => {
    captured.event = null;
    captured.players = [];
    captured.userId = null;
  });

  /** @returns The standings row for one player. */
  function standingsRow(name: string) {
    return screen.getByRole("row", { name: new RegExp(name, "u") });
  }

  it("renders nothing when the archive holds no standings", () => {
    renderEvent({}, []);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("lists every player, the deckless ones included", () => {
    renderEvent({}, [
      player({ id: "p-1", playerName: "Ana", rank: 1 }),
      player({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);

    expect(standingsRow("Ana")).toBeInTheDocument();
    expect(standingsRow("Bo")).toBeInTheDocument();
  });

  it("prints an exact standing as an ordinal and a cut bucket as a bracket", () => {
    renderEvent({}, [
      player({ id: "p-1", playerName: "Ana", rank: 4, rankIsTier: false }),
      player({ id: "p-2", playerName: "Bo", rank: 8, rankIsTier: true }),
    ]);

    expect(within(standingsRow("Ana")).getByText("4th")).toBeInTheDocument();
    expect(within(standingsRow("Bo")).getByText("T8")).toBeInTheDocument();
  });

  it("derives the record from wins, losses, and draws", () => {
    renderEvent({}, [
      player({ id: "p-1", playerName: "Ana", wins: 6, losses: 1, draws: null }),
      player({ id: "p-2", playerName: "Bo", wins: 5, losses: 1, draws: 1 }),
    ]);

    expect(within(standingsRow("Ana")).getByText("6-1")).toBeInTheDocument();
    expect(within(standingsRow("Bo")).getByText("5-1-1")).toBeInTheDocument();
  });

  it("shows no record for a player the source published none for", () => {
    renderEvent({}, [player({ playerName: "Ana", wins: null, losses: null, draws: null })]);
    expect(within(standingsRow("Ana")).queryByText(/^\d+-\d+/u)).toBeNull();
  });

  it("names the legend, which the archive knows without a list", () => {
    renderEvent({}, [player({ playerName: "Ana" })]);
    expect(within(standingsRow("Ana")).getByText("Yasuo, the Unforgiven")).toBeInTheDocument();
  });

  it("leads the legend to its card page", () => {
    renderEvent({}, [player({ playerName: "Ana" })]);
    const link = within(standingsRow("Ana")).getByRole("link", { name: "Yasuo, the Unforgiven" });
    expect(link.getAttribute("href")).toBe("/cards/yasuo-the-unforgiven");
  });

  it("prints a legend with no slug as plain text rather than a dead link", () => {
    renderEvent({}, [
      player({
        playerName: "Ana",
        legend: { cardId: "card-yasuo", name: "Yasuo, the Unforgiven", slug: "", imageId: null },
      }),
    ]);
    const cell = within(standingsRow("Ana"));
    expect(cell.getByText("Yasuo, the Unforgiven")).toBeInTheDocument();
    expect(cell.queryByRole("link", { name: "Yasuo, the Unforgiven" })).toBeNull();
  });

  it("leaves the legend cell empty for a player the archive knows none for", () => {
    renderEvent({}, [player({ playerName: "Ana", legend: null })]);
    expect(within(standingsRow("Ana")).queryByText(/Yasuo/u)).toBeNull();
  });

  it("links only the players whose list the archive holds", () => {
    renderEvent({}, [
      player({
        id: "p-1",
        playerName: "Ana",
        deckId: "d1",
        deckName: "Yasuo Aggro",
        shareToken: "tok1",
        listStatus: "full",
      }),
      player({ id: "p-2", playerName: "Bo" }),
    ]);

    const link = within(standingsRow("Ana")).getByRole("link", { name: "Decklist" });
    expect(link.getAttribute("href")).toBe("/meta/decks/tok1");
    expect(within(standingsRow("Bo")).queryByRole("link", { name: "Decklist" })).toBeNull();
  });

  it("says when a linked list is only partial", () => {
    renderEvent({}, [
      player({
        playerName: "Ana",
        deckId: "d1",
        deckName: "Yasuo Aggro",
        shareToken: "tok1",
        listStatus: "partial",
      }),
    ]);
    expect(
      within(standingsRow("Ana")).getByRole("link", { name: "Partial list" }),
    ).toBeInTheDocument();
  });

  it("says the results have not arrived rather than showing an empty field", () => {
    renderEvent({}, []);
    expect(
      screen.getByText("The results for this event have not come through yet. Check back soon."),
    ).toBeInTheDocument();
  });
});
