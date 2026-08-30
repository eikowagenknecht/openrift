import type { MetaEventPlayer } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { metaPlayer } from "@/test/meta-event-fixtures";

const session = vi.hoisted(() => ({ userId: "user-1" as string | null }));

vi.mock("@/lib/auth-session", () => ({ useUserId: () => session.userId }));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: { domains: ["fury"] }, labels: { domains: { fury: "Fury" } } }),
}));

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink };
});

const { MetaEventDecklists } = await import("./meta-event-decklists");

/** A standings row with a full list hanging off it. */
function withList(overrides: Partial<MetaEventPlayer> = {}): MetaEventPlayer {
  return metaPlayer({
    deckId: "d1",
    deckName: "Yasuo Aggro",
    shareToken: "tok1",
    listStatus: "full",
    ...overrides,
  });
}

function renderDecklists(players: MetaEventPlayer[], fieldSize: number | null = 64) {
  render(<MetaEventDecklists players={players} fieldSize={fieldSize} slug="summoner-skirmish" />);
}

function row(name: string): HTMLElement {
  return screen.getByText(new RegExp(name, "u")).closest("li") as HTMLElement;
}

describe("MetaEventDecklists", () => {
  beforeEach(() => {
    session.userId = "user-1";
  });

  it("says nothing has been archived rather than showing an empty grid", () => {
    renderDecklists([metaPlayer()]);
    expect(screen.getByText(/haven.t archived any decks/u)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("lists only the entries with a list behind them", () => {
    renderDecklists([
      withList({ id: "p-1", playerName: "Ana" }),
      metaPlayer({ id: "p-2", playerName: "Bo" }),
    ]);

    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(row("Ana")).toBeInTheDocument();
  });

  it("counts the lists against the field the source reported", () => {
    renderDecklists([withList()], 588);
    expect(screen.getByText("1 of 588 entries")).toBeInTheDocument();
  });

  it("falls back to the rows it holds when no field size was published", () => {
    renderDecklists([withList({ id: "p-1" }), metaPlayer({ id: "p-2", playerName: "Bo" })], null);
    expect(screen.getByText("1 of 2 entries")).toBeInTheDocument();
  });

  it("names the legend and prints the finish, player, and full record", () => {
    renderDecklists([withList({ rank: 1, playerName: "Ana", wins: 6, losses: 1, draws: null })]);
    const entry = within(row("Ana"));
    expect(entry.getByText("Yasuo")).toBeInTheDocument();
    expect(entry.getByText("the Unforgiven")).toBeInTheDocument();
    expect(entry.getByText("1st · Ana · 6-1-0")).toBeInTheDocument();
  });

  it("leaves the record out of the byline when the source published none", () => {
    renderDecklists([withList({ playerName: "Ana", wins: null, losses: null, draws: null })]);
    expect(within(row("Ana")).getByText("1st · Ana")).toBeInTheDocument();
  });

  it("leads the whole row to the archived deck", () => {
    renderDecklists([withList({ playerName: "Ana", shareToken: "tok9" })]);
    const link = within(row("Ana")).getByRole("link", { name: /Yasuo/u });
    expect(link.getAttribute("href")).toBe("/meta/decks/tok9");
  });

  it("marks a partial list and offers to complete it, prefilled from the row", () => {
    renderDecklists([
      withList({ playerName: "Ana", rank: 3, wins: 5, losses: 2, draws: 0, listStatus: "partial" }),
    ]);

    const entry = within(row("Ana"));
    expect(entry.getByText("Partial list")).toBeInTheDocument();
    const href = entry.getByRole("link", { name: "Complete" }).getAttribute("href") ?? "";
    const search = new URLSearchParams(href.split("?")[1]);
    expect(href.startsWith("/meta/summoner-skirmish/submit?")).toBe(true);
    expect(search.get("player")).toBe("Ana");
    expect(search.get("rank")).toBe("3");
  });

  it("offers nothing to complete on a list the archive holds in full", () => {
    renderDecklists([withList({ playerName: "Ana" })]);
    expect(screen.queryByRole("link", { name: "Complete" })).toBeNull();
    expect(screen.queryByText("Partial list")).toBeNull();
  });

  it("still marks a partial list for a signed-out reader, without a form they cannot open", () => {
    session.userId = null;
    renderDecklists([withList({ playerName: "Ana", listStatus: "partial" })]);
    expect(screen.getByText("Partial list")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Complete" })).toBeNull();
  });

  it("medals the podium and leaves the rest of the field unmedalled", () => {
    renderDecklists([
      withList({ id: "p-1", playerName: "Ana", rank: 3, shareToken: "t1" }),
      withList({ id: "p-2", playerName: "Bo", rank: 4, shareToken: "t2" }),
    ]);

    expect(within(row("Ana")).getByText("3")).toBeInTheDocument();
    expect(within(row("Bo")).queryByText("4")).toBeNull();
  });
});
