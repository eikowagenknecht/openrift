import type { MetaEventPlayer } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metaPlayer } from "@/test/meta-event-fixtures";

const session = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@/lib/auth-session", () => ({ useUserId: () => session.userId }));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: { domains: ["fury"] }, labels: { domains: { fury: "Fury" } } }),
}));

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink };
});

// The real preview suspends on the deck query and pulls the price feed with it.
vi.mock("@/components/meta/meta-event-deck-preview", () => ({
  MetaEventDeckPreview: ({ token }: { token: string }) => <p>Preview for {token}</p>,
  MetaEventDeckPreviewSkeleton: () => null,
}));

const { MetaEventStandings } = await import("./meta-event-standings");

/** The phone rendering, which is the one carrying every fact in one element. */
function phoneRow(name: string): HTMLElement {
  const list = screen.getByRole("list");
  return within(list).getByText(name).closest("li") as HTMLElement;
}

function renderStandings(players: MetaEventPlayer[] = [metaPlayer()], eventDate = "2020-01-01") {
  render(<MetaEventStandings players={players} slug="summoner-skirmish" eventDate={eventDate} />);
}

function field(count: number, overrides: (index: number) => Partial<MetaEventPlayer> = () => ({})) {
  return Array.from({ length: count }, (_, index) =>
    metaPlayer({
      id: `p-${index}`,
      playerName: `Player ${index}`,
      rank: index + 1,
      ...overrides(index),
    }),
  );
}

describe("MetaEventStandings", () => {
  beforeEach(() => {
    session.userId = null;
  });

  it("says nothing is on file rather than showing an empty field", () => {
    renderStandings([]);
    expect(screen.getByText("No standings on file for this event yet.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says an event still to come has not been played rather than that results are late", () => {
    renderStandings([], "2999-01-01");
    expect(
      screen.getByText(
        "This event has not been played yet. Standings will appear here once it has.",
      ),
    ).toBeInTheDocument();
  });

  it("counts the field and how much of it has a list", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1, shareToken: "tok1" }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);
    expect(screen.getByText("2 entries · 1 with a decklist")).toBeInTheDocument();
  });

  it("counts only the entries when the archive holds no list at all", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1 }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);
    expect(screen.getByText("2 entries")).toBeInTheDocument();
  });

  it("lists every player, the deckless ones included", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1 }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);
    expect(phoneRow("Ana")).toBeInTheDocument();
    expect(phoneRow("Bo")).toBeInTheDocument();
  });

  it("medals the podium and numbers the rest", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 3 }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 4 }),
    ]);
    expect(within(phoneRow("Ana")).getByText("3")).toBeInTheDocument();
    expect(within(phoneRow("Bo")).getByText("4th")).toBeInTheDocument();
  });

  it("offers a legend filter once the field played more than one", () => {
    const legend = metaPlayer().legend;
    renderStandings(
      field(9, (index) => ({
        legend:
          index % 2 === 0
            ? legend
            : { ...legend!, cardId: "other-legend", name: "Ahri, the Nine-Tailed Fox" },
      })),
    );

    expect(screen.getByLabelText("Filter by legend")).toBeInTheDocument();
  });

  it("keeps the legend filter out of a field that all played the same one", () => {
    renderStandings(field(9));

    expect(screen.queryByLabelText("Filter by legend")).toBeNull();
  });

  it("prints a cut bucket as a bracket rather than an ordinal", () => {
    renderStandings([metaPlayer({ playerName: "Bo", rank: 8, rankIsTier: true })]);
    expect(within(phoneRow("Bo")).getByText("T8")).toBeInTheDocument();
  });

  it("shows legend art on every row, cut or not", () => {
    const legend = metaPlayer().legend;
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 4, legend: { ...legend!, imageId: "art" } }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 40, legend: { ...legend!, imageId: "art" } }),
    ]);
    expect(phoneRow("Ana").querySelector('img[src*="art-120w"]')).not.toBeNull();
    expect(phoneRow("Bo").querySelector('img[src*="art-120w"]')).not.toBeNull();
  });

  it("drops both optional columns when the source published bare placings", () => {
    renderStandings(field(2, () => ({ legend: null, champion: null })));

    expect(screen.queryByRole("columnheader", { name: "Legend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Decklist" })).not.toBeInTheDocument();
    expect(phoneRow("Player 0").querySelector('[data-slot="card-art-thumb"]')).toBeNull();
  });

  it("keeps the legend column when a single entry names one", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1 }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2, legend: null }),
    ]);

    expect(screen.getByRole("columnheader", { name: "Legend" })).toBeInTheDocument();
    expect(phoneRow("Bo").querySelector('[data-slot="card-art-thumb"]')).not.toBeNull();
  });

  it("keeps the decklist column for anyone who can send one in", () => {
    session.userId = "u-1";
    renderStandings(field(2, () => ({ legend: null, champion: null })));

    expect(screen.getByRole("columnheader", { name: "Decklist" })).toBeInTheDocument();
    expect(within(phoneRow("Player 0")).getByRole("link", { name: "+ Add" })).toBeInTheDocument();
  });

  it("washes the winner's row in the archive's gold", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1 }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);
    expect(phoneRow("Ana").className).toContain("bg-border-accent/10");
    expect(phoneRow("Bo").className).not.toContain("bg-border-accent/10");
  });

  it("derives the record as all three parts", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", wins: 6, losses: 1, draws: null }),
      metaPlayer({ id: "p-2", playerName: "Bo", wins: 5, losses: 1, draws: 1 }),
    ]);
    expect(within(phoneRow("Ana")).getByText("6-1-0")).toBeInTheDocument();
    expect(within(phoneRow("Bo")).getByText("5-1-1")).toBeInTheDocument();
  });

  it("names the legend and draws its domain runes", () => {
    renderStandings();
    const row = within(phoneRow("Ana"));
    expect(row.getByText("Yasuo")).toBeInTheDocument();
    expect(row.getByText("the Unforgiven")).toBeInTheDocument();
    expect(row.getByRole("img", { name: "Fury" })).toBeInTheDocument();
  });

  it("leads the legend to its archive page on phones too", () => {
    renderStandings();
    const link = within(phoneRow("Ana")).getByRole("link", { name: "Yasuo" });
    expect(link.getAttribute("href")).toBe("/meta/legends/yasuo-yasuo-the-unforgiven");
  });

  it("marks a linked list that is only partial", () => {
    renderStandings([
      metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1", listStatus: "partial" }),
    ]);
    expect(within(phoneRow("Ana")).getByText("Partial list")).toBeInTheDocument();
  });

  it("leaves a full list unmarked", () => {
    renderStandings([
      metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1", listStatus: "full" }),
    ]);
    expect(within(phoneRow("Ana")).queryByText("Partial list")).toBeNull();
  });

  it("offers a signed-in reader the form, prefilled from the row", () => {
    session.userId = "user-1";
    renderStandings([
      metaPlayer({ playerName: "Ana", rank: 8, rankIsTier: true, wins: 12, losses: 3, draws: 0 }),
    ]);

    const link = within(phoneRow("Ana")).getByRole("link", { name: "+ Add" });
    const href = link.getAttribute("href") ?? "";
    expect(href.startsWith("/meta/summoner-skirmish/submit?")).toBe(true);
    const search = new URLSearchParams(href.split("?")[1]);
    expect(search.get("player")).toBe("Ana");
    expect(search.get("rank")).toBe("8");
    expect(search.get("cut")).toBe("true");
  });

  it("offers a signed-out reader nothing to click on a list-less row", () => {
    renderStandings([metaPlayer({ playerName: "Ana" })]);
    expect(screen.queryByRole("link", { name: "+ Add" })).toBeNull();
  });

  it("opens a row's decklist in place", async () => {
    const user = userEvent.setup();
    renderStandings([metaPlayer({ playerName: "Ana", shareToken: "tok1" })]);

    expect(screen.queryByText("Preview for tok1")).toBeNull();
    await user.click(within(phoneRow("Ana")).getByRole("button", { name: "Decklist" }));
    expect(within(phoneRow("Ana")).getByText("Preview for tok1")).toBeInTheDocument();
  });

  it("opens and closes a decklist from anywhere on the row", async () => {
    const user = userEvent.setup();
    renderStandings([metaPlayer({ playerName: "Ana", shareToken: "tok1" })]);

    await user.click(within(phoneRow("Ana")).getByText("Ana"));
    expect(within(phoneRow("Ana")).getByText("Preview for tok1")).toBeInTheDocument();

    await user.click(within(phoneRow("Ana")).getByText("Ana"));
    expect(screen.queryByText("Preview for tok1")).toBeNull();
  });

  it("leaves a row's own links clickable", async () => {
    const user = userEvent.setup();
    renderStandings([metaPlayer({ playerName: "Ana", shareToken: "tok1" })]);

    await user.click(within(phoneRow("Ana")).getByRole("link", { name: /Yasuo/u }));
    expect(screen.queryByText("Preview for tok1")).toBeNull();
  });

  it("closes an open decklist when another one opens", async () => {
    const user = userEvent.setup();
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1, shareToken: "tok1" }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2, shareToken: "tok2" }),
    ]);

    await user.click(within(phoneRow("Ana")).getByRole("button", { name: "Decklist" }));
    await user.click(within(phoneRow("Bo")).getByRole("button", { name: "Decklist" }));

    expect(screen.queryByText("Preview for tok1")).toBeNull();
    expect(within(phoneRow("Bo")).getByText("Preview for tok2")).toBeInTheDocument();
  });

  it("narrows the field to the entries with a list", async () => {
    const user = userEvent.setup();
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1, shareToken: "tok1" }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);

    await user.click(screen.getByRole("button", { name: "With decklist (1)" }));
    expect(phoneRow("Ana")).toBeInTheDocument();
    expect(screen.queryByText("Bo")).toBeNull();

    await user.click(screen.getByRole("button", { name: "All entries" }));
    expect(phoneRow("Bo")).toBeInTheDocument();
  });

  it("offers no decklist filter for a field with none on file", () => {
    renderStandings(field(12));
    expect(screen.queryByRole("button", { name: /With decklist/u })).toBeNull();
  });

  it("finds a player by name", async () => {
    const user = userEvent.setup();
    renderStandings(field(12));

    await user.type(screen.getByRole("searchbox", { name: "Find a player" }), "player 7");
    expect(phoneRow("Player 7")).toBeInTheDocument();
    expect(screen.queryByText("Player 6")).toBeNull();
  });

  it("says so when nothing matches what was typed", async () => {
    const user = userEvent.setup();
    renderStandings(field(12));

    await user.type(screen.getByRole("searchbox", { name: "Find a player" }), "Ziggs");
    expect(screen.getByText("No entries match.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("opens a long field partly, then shows the rest on request", async () => {
    const user = userEvent.setup();
    renderStandings(field(20));

    expect(screen.queryByText("Player 19")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all 20 entries" }));
    expect(screen.getAllByText("Player 19").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Player 19")).toBeNull();
  });

  it("counts the narrowed field in the show-all button", async () => {
    const user = userEvent.setup();
    renderStandings(field(20, (index) => (index < 18 ? { shareToken: `tok-${index}` } : {})));

    await user.click(screen.getByRole("button", { name: "With decklist (18)" }));
    expect(screen.getByRole("button", { name: "Show all 18 entries" })).toBeInTheDocument();
  });

  it("offers no toggle for a field that already fits", () => {
    renderStandings([metaPlayer()]);
    expect(screen.queryByRole("button", { name: /Show all/u })).toBeNull();
  });
});
