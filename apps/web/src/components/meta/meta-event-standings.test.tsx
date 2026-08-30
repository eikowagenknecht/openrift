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

const { MetaEventStandings } = await import("./meta-event-standings");

/** The phone rendering, which is the one carrying every fact in one element. */
function phoneRow(name: string): HTMLElement {
  const list = screen.getByRole("list");
  return within(list).getByText(name).closest("li") as HTMLElement;
}

function renderStandings(players = [metaPlayer()]) {
  render(<MetaEventStandings players={players} slug="summoner-skirmish" />);
}

describe("MetaEventStandings", () => {
  beforeEach(() => {
    session.userId = null;
  });

  it("says the results have not arrived rather than showing an empty field", () => {
    renderStandings([]);
    expect(
      screen.getByText("The results for this event have not come through yet. Check back soon."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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

  it("prints a cut bucket as a bracket rather than an ordinal", () => {
    renderStandings([metaPlayer({ playerName: "Bo", rank: 8, rankIsTier: true })]);
    expect(within(phoneRow("Bo")).getByText("T8")).toBeInTheDocument();
  });

  it("derives the record as all three parts", () => {
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", wins: 6, losses: 1, draws: null }),
      metaPlayer({ id: "p-2", playerName: "Bo", wins: 5, losses: 1, draws: 1 }),
    ]);
    expect(within(phoneRow("Ana")).getByText("6-1-0")).toBeInTheDocument();
    expect(within(phoneRow("Bo")).getByText("5-1-1")).toBeInTheDocument();
  });

  it("shows no record for a player the source published none for", () => {
    renderStandings([metaPlayer({ playerName: "Ana", wins: null, losses: null, draws: null })]);
    expect(within(phoneRow("Ana")).queryByText(/^\d+-\d+/u)).toBeNull();
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

  it("leaves the legend out for a player the archive knows none for", () => {
    renderStandings([metaPlayer({ playerName: "Ana", legend: null })]);
    expect(within(phoneRow("Ana")).queryByText("Yasuo")).toBeNull();
  });

  it("links the players whose list the archive holds", () => {
    renderStandings([
      metaPlayer({
        playerName: "Ana",
        deckId: "d1",
        deckName: "Yasuo Aggro",
        shareToken: "tok1",
        listStatus: "full",
      }),
    ]);
    const link = within(phoneRow("Ana")).getByRole("link", { name: "Decklist" });
    expect(link.getAttribute("href")).toBe("/meta/decks/tok1");
  });

  it("says when a linked list is only partial", () => {
    renderStandings([
      metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1", listStatus: "partial" }),
    ]);
    expect(within(phoneRow("Ana")).getByRole("link", { name: "Partial" })).toBeInTheDocument();
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
    expect(search.get("wins")).toBe("12");
    expect(search.get("losses")).toBe("3");
    expect(search.get("draws")).toBe("0");
  });

  it("offers a signed-out reader nothing to click on a list-less row", () => {
    renderStandings([metaPlayer({ playerName: "Ana" })]);
    expect(screen.queryByRole("link", { name: "+ Add" })).toBeNull();
  });

  it("opens a long field partly, then shows the rest on request", async () => {
    const user = userEvent.setup();
    const players = Array.from({ length: 20 }, (_, index) =>
      metaPlayer({ id: `p-${index}`, playerName: `Player ${index}`, rank: index + 1 }),
    );
    renderStandings(players);

    expect(screen.queryByText("Player 19")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Show all 20 entries" }));
    expect(screen.getAllByText("Player 19").length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText("Player 19")).toBeNull();
  });

  it("offers no toggle for a field that already fits", () => {
    renderStandings([metaPlayer()]);
    expect(screen.queryByRole("button", { name: /Show all/u })).toBeNull();
  });
});
