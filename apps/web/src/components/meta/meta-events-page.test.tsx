import type { MetaEventSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  events: [] as MetaEventSummary[],
  search: {} as Record<string, unknown>,
  navigated: [] as Record<string, unknown>[],
}));

vi.mock("@tanstack/react-router", () => {
  function Anchor({ children, ...rest }: { children?: React.ReactNode }) {
    return <a {...rest}>{children ?? "link"}</a>;
  }
  return {
    getRouteApi: () => ({
      useSearch: () => captured.search,
      useNavigate:
        () =>
        ({ search }: { search: (prev: Record<string, unknown>) => Record<string, unknown> }) => {
          captured.navigated.push(search(captured.search));
        },
    }),
    Link: Anchor,
    createLink: () => Anchor,
  };
});

vi.mock("@/hooks/use-meta", () => ({
  useMetaEvents: () => ({ data: { events: captured.events } }),
}));
vi.mock("@/hooks/use-meta-eras", () => ({ useMetaEras: () => [] }));
// Stubbed down to the slot the page fills: the bar's own controls have their
// own tests, but the holdings select is this page's and rides inside it.
vi.mock("@/components/meta/meta-scope-bar", () => ({
  MetaScopeBar: ({ extras }: { extras?: React.ReactNode }) => <div>{extras}</div>,
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaEventsPage } from "./meta-events-page";

function event(overrides: Partial<MetaEventSummary> = {}): MetaEventSummary {
  return {
    id: "e1",
    slug: "summoner-skirmish-vienna",
    name: "Summoner Skirmish at Cardhouse Vienna",
    eventDate: "2026-08-29",
    format: "constructed",
    tier: "store",
    country: "AT",
    location: "Vienna",
    playerCount: 18,
    organizer: "Cardhouse",
    playerRowCount: 18,
    deckCount: 4,
    winners: [],
    ...overrides,
  };
}

function renderPage(events: MetaEventSummary[], search: Record<string, unknown> = {}) {
  captured.events = events;
  captured.search = search;
  const view = render(<MetaEventsPage />);
  return {
    /** Re-renders under new URL params, the way a navigate would. */
    navigateTo(next: Record<string, unknown>) {
      captured.search = next;
      view.rerender(<MetaEventsPage />);
    },
  };
}

function winner(playerName: string): MetaEventSummary["winners"][number] {
  return {
    playerName,
    wins: 5,
    losses: 1,
    draws: 0,
    legend: {
      cardId: "c1",
      name: "Lee Sin, the Blind Monk",
      slug: "lee-sin",
      imageId: "i1",
      domains: ["body"],
      archiveSlug: "lee-sin-lee-sin",
    },
  };
}

/** @returns 52 events, one more than a page and a half. */
function manyEvents(): MetaEventSummary[] {
  return Array.from({ length: 52 }, (_, index) =>
    event({
      id: `e${index}`,
      name: `Event ${String(index).padStart(2, "0")}`,
      eventDate: `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
    }),
  );
}

/**
 * The event names in the order the list renders them. Both the column layout
 * and the card layout are in the DOM at once (CSS picks between them), so the
 * first title of each row is the one to read.
 *
 * @returns One name per row.
 */
function rowNames(): string[] {
  return screen.getAllByRole("listitem").map((row) => row.querySelector("p")?.textContent ?? "");
}

beforeEach(() => {
  captured.events = [];
  captured.search = {};
  captured.navigated = [];
});

describe("MetaEventsPage", () => {
  it("lists every archived event, newest first", () => {
    renderPage([
      event({ id: "old", name: "City Challenge Lyon", eventDate: "2026-08-09" }),
      event({ id: "new", name: "Regional Qualifier Milan", eventDate: "2026-08-16" }),
    ]);
    expect(rowNames()).toEqual(["Regional Qualifier Milan", "City Challenge Lyon"]);
  });

  it("counts what the archive holds in the top bar", () => {
    renderPage([event({ id: "a" }), event({ id: "b", name: "Nexus Night" })]);
    expect(screen.getByText("2 archived events")).toBeDefined();
  });

  it("says how many of the archive a narrowed view is showing", () => {
    renderPage([event({ id: "a" }), event({ id: "b", name: "Nexus Night" })], { q: "nexus" });
    expect(screen.getByText("1 of 2 archived events")).toBeDefined();
    expect(rowNames()).toEqual(["Nexus Night"]);
  });

  it("dates a row by month, day and year, so a multi-year archive reads unambiguously", () => {
    renderPage([event({ eventDate: "2026-08-29" })]);
    // One tile per layout: the column row and the phone card are both in the DOM.
    expect(screen.getAllByText("AUG")).toHaveLength(2);
    expect(screen.getAllByText("2026")).toHaveLength(2);
  });

  it("announces the date once, with the tile itself hidden from assistive tech", () => {
    renderPage([event({ eventDate: "2026-08-29" })]);
    expect(screen.getAllByText("2026-08-29")).toHaveLength(1);
    expect(screen.getAllByText("2026")[0].closest("[aria-hidden]")).not.toBeNull();
  });

  it("names the winner of each event inline", () => {
    renderPage([event({ winners: [winner("A. Gruber")] })]);
    expect(screen.getAllByText("A. Gruber").length).toBeGreaterThan(0);
  });

  it("names both players an event recorded two first places for", () => {
    renderPage([event({ winners: [winner("A. Gruber"), winner("M. Álvarez")] })]);
    expect(screen.getAllByText("A. Gruber and M. Álvarez").length).toBeGreaterThan(0);
  });

  it("says a played event holds no results rather than counting a field of zero", () => {
    renderPage([event({ eventDate: "2026-01-10", playerRowCount: 0, deckCount: 0 })]);
    expect(screen.getByText("18 players · No results on file")).toBeDefined();
  });

  it("says an event still to come has not been played yet", () => {
    renderPage([event({ eventDate: "2099-01-10", playerRowCount: 0, deckCount: 0 })]);
    expect(screen.getByText("18 players · Not played yet")).toBeDefined();
  });

  it("writes the chosen column and direction to the URL", async () => {
    renderPage([event()]);
    await userEvent.click(screen.getByRole("button", { name: /players/iu }));
    expect(captured.navigated.at(-1)).toMatchObject({ by: "players", dir: "desc" });
  });

  it("flips the direction when the same column is clicked again", async () => {
    renderPage([event()], { by: "players", dir: "desc" });
    await userEvent.click(screen.getByRole("button", { name: /players/iu }));
    expect(captured.navigated.at(-1)).toMatchObject({ by: "players", dir: "asc" });
  });

  it("offers the rest of a long archive rather than rendering all of it", async () => {
    renderPage(manyEvents());

    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    await userEvent.click(screen.getByRole("button", { name: "2 more events" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(52);
  });

  it("keeps an expanded list expanded when the reader only reorders it", async () => {
    const page = renderPage(manyEvents());
    await userEvent.click(screen.getByRole("button", { name: "2 more events" }));

    page.navigateTo({ by: "name", dir: "asc" });

    expect(screen.getAllByRole("listitem")).toHaveLength(52);
  });

  it("collapses an expanded list back to the first page once the filters change", async () => {
    const page = renderPage(manyEvents());
    await userEvent.click(screen.getByRole("button", { name: "2 more events" }));

    page.navigateTo({ q: "Event" });

    expect(screen.getAllByRole("listitem")).toHaveLength(50);
  });

  it("tells a reader whose filters match nothing, without emptying the page", () => {
    renderPage([event()], { q: "piltover" });
    expect(screen.getByText("No events match these filters.")).toBeDefined();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("invites the first event when the archive is empty", () => {
    renderPage([]);
    expect(screen.getByText("No events archived yet")).toBeDefined();
    expect(screen.queryByRole("button", { name: /players/iu })).toBeNull();
  });

  it("lists only the events holding what the reader asked for", () => {
    const events = [
      event({ id: "listed", name: "With lists", deckCount: 4 }),
      event({ id: "pending", name: "Nothing yet", playerRowCount: 0, deckCount: 0 }),
    ];
    renderPage(events, { holds: "decks" });

    expect(screen.getAllByText("With lists").length).toBeGreaterThan(0);
    expect(screen.queryAllByText("Nothing yet")).toHaveLength(0);
    expect(screen.getByText("1 of 2 archived events")).toBeDefined();
  });

  it("writes the picked holdings to the URL and clears it back", async () => {
    renderPage([event()]);
    await userEvent.click(screen.getByLabelText("Archive holdings"));
    await userEvent.click(await screen.findByRole("option", { name: "With decklists" }));
    expect(captured.navigated.at(-1)).toMatchObject({ holds: "decks" });

    captured.search = { holds: "decks" };
    await userEvent.click(screen.getByLabelText("Archive holdings"));
    await userEvent.click(await screen.findByRole("option", { name: "Any events" }));
    expect(captured.navigated.at(-1)).toEqual({});
  });
});
