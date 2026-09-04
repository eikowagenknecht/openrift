import type { MetaEventMatch, MetaEventPhase, MetaEventPlayer } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaDeckCostFilterProps } from "@/components/meta/meta-deck-cost-filter";
import type { MetaDeckCost } from "@/lib/meta-deck-collection";
import { metaMatch, metaPhase, metaPlayer } from "@/test/meta-event-fixtures";

const session = vi.hoisted(() => ({ userId: null as string | null }));
const archive = vi.hoisted(() => ({
  costs: undefined as ReadonlyMap<string, MetaDeckCost> | undefined,
  withCollection: [] as boolean[],
  includeSideboard: [] as boolean[],
}));

vi.mock("@/lib/auth-session", () => ({ useUserId: () => session.userId }));
vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: () => true }));
vi.mock("@/hooks/use-meta-deck-costs", () => ({
  useMetaDeckCosts: (side: boolean, options: { withCollection: boolean }) => {
    archive.withCollection.push(options.withCollection);
    archive.includeSideboard.push(side);
    return archive.costs;
  },
}));

// The real control is a popover over two sliders; these buttons drive the same callbacks.
vi.mock("@/components/meta/meta-deck-cost-filter", () => ({
  EMPTY_META_COST_FILTER: {
    maxCost: null,
    valueRange: { min: null, max: null },
    includeSideboard: false,
  },
  MetaDeckCostFilter: (props: MetaDeckCostFilterProps) => (
    <div>
      <p>{`cost ready: ${props.ready}`}</p>
      <p>{`cost noun: ${props.noun}`}</p>
      <p>{`cost trigger: ${props.trigger}`}</p>
      <p>{`cost collection: ${props.withCollection}`}</p>
      <p>{`cost matches: ${props.countUnderCost(10)}`}</p>
      <p>{`cost ceiling: ${props.maxValue}`}</p>
      <p>{`completion ceiling: ${props.maxToComplete}`}</p>
      <p>{`cost sideboard: ${props.value.includeSideboard}`}</p>
      <button type="button" onClick={() => props.onMaxCostChange(10)}>
        cost bound
      </button>
      <button type="button" onClick={() => props.onMaxCostChange(0)}>
        buildable
      </button>
      <button type="button" onClick={() => props.onValueRangeChange({ min: null, max: 100 })}>
        value bound
      </button>
      <button type="button" onClick={() => props.onIncludeSideboardChange(false)}>
        drop sideboard
      </button>
      <button type="button" onClick={props.onClear}>
        clear cost
      </button>
    </div>
  ),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ orders: { domains: ["fury"] }, labels: { domains: { fury: "Fury" } } }),
}));

vi.mock("@tanstack/react-router", async () => {
  const fixtures = await import("@/test/meta-event-fixtures");
  return { Link: fixtures.StubLink };
});

vi.mock("@/components/cards/card-detail-opener", () => ({
  CardDetailOverlayProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// The real preview suspends on the deck query and pulls the price feed with it.
vi.mock("@/components/meta/meta-event-deck-preview", () => ({
  MetaEventDeckPreview: ({ token }: { token: string }) => <p>Preview for {token}</p>,
  MetaEventDeckPreviewSkeleton: () => null,
}));

// jsdom has no window.scrollTo, and the window virtualizer calls it on mount.
globalThis.scrollTo = () => {};

const { MetaEventStandings } = await import("./meta-event-standings");

/** The phone rendering, which is the one carrying every fact in one element. */
function phoneRow(name: string): HTMLElement {
  const list = screen.getByRole("list");
  return within(list).getByText(name).closest("li") as HTMLElement;
}

function renderStandings(
  players: MetaEventPlayer[] = [metaPlayer()],
  eventDate = "2020-01-01",
  rounds: { matches?: MetaEventMatch[]; phases?: MetaEventPhase[] } = {},
) {
  render(
    <MetaEventStandings
      players={players}
      matches={rounds.matches ?? []}
      phases={rounds.phases ?? []}
      slug="summoner-skirmish"
      eventDate={eventDate}
    />,
  );
}

const SWISS = metaPhase({ phaseOrder: 1, name: "Phase 1", roundType: "SWISS", rankRequired: null });

const ANA_RUN = {
  phases: [SWISS, metaPhase()],
  matches: [
    metaMatch({ phaseOrder: 1, roundNumber: 1, player2Id: null, winnerId: null, isBye: true }),
    metaMatch({ phaseOrder: 1, roundNumber: 2, winnerId: "p-1" }),
    metaMatch({ phaseOrder: 1, roundNumber: 3, winnerId: "p-2" }),
    metaMatch({ phaseOrder: 1, roundNumber: 4, winnerId: null, isDraw: true }),
    metaMatch({ roundNumber: 1, winnerId: "p-1" }),
    metaMatch({ roundNumber: 2, winnerId: "p-1" }),
  ],
};

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
    archive.costs = undefined;
    archive.withCollection = [];
    archive.includeSideboard = [];
  });

  it("charts each player's run once the source filed round-by-round results", () => {
    renderStandings([metaPlayer({ id: "p-1", playerName: "Ana" })], "2020-01-01", ANA_RUN);

    expect(screen.getByRole("columnheader", { name: "Run" })).toBeInTheDocument();
    const strip = within(phoneRow("Ana")).getByRole("img", {
      name: "Round by round: bye, win, loss, draw, then the cut: win, win",
    });
    expect(strip.querySelectorAll("[title]")).toHaveLength(6);
    expect(strip.querySelectorAll("span.w-1")).toHaveLength(1);
  });

  it("keeps the run column out of an event that arrived as bare standings", () => {
    renderStandings([metaPlayer({ playerName: "Ana" })]);

    expect(screen.queryByRole("columnheader", { name: "Run" })).toBeNull();
    expect(within(phoneRow("Ana")).queryByRole("img", { name: /Round by round/u })).toBeNull();
  });

  it("leads a charted run to the player's page for the event", () => {
    renderStandings(
      [metaPlayer({ id: "p-1", playerName: "Ana", playerKey: "u1001" })],
      "2020-01-01",
      ANA_RUN,
    );

    const links = screen.getAllByRole("link", { name: /Round by round/u });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/meta/summoner-skirmish/players/u1001");
    }
  });

  it("charts the run of a player the source filed under no identity without a link", () => {
    renderStandings(
      [metaPlayer({ id: "p-1", playerName: "Ana", playerKey: null })],
      "2020-01-01",
      ANA_RUN,
    );

    expect(
      within(phoneRow("Ana")).getByRole("img", { name: /Round by round/u }),
    ).toBeInTheDocument();
    expect(within(phoneRow("Ana")).queryByRole("link", { name: /Round by round/u })).toBeNull();
  });

  it("leaves the run blank for a player the source paired in no round", () => {
    renderStandings(
      [
        metaPlayer({ id: "p-1", playerName: "Ana" }),
        metaPlayer({ id: "p-9", playerName: "Zed", rank: 9 }),
      ],
      "2020-01-01",
      ANA_RUN,
    );

    expect(within(phoneRow("Zed")).queryByRole("img", { name: /Round by round/u })).toBeNull();
  });

  it("leaves a row's run link out of the decklist disclosure", async () => {
    const user = userEvent.setup();
    renderStandings(
      [metaPlayer({ id: "p-1", playerName: "Ana", shareToken: "tok1" })],
      "2020-01-01",
      ANA_RUN,
    );

    await user.click(within(phoneRow("Ana")).getByRole("link", { name: /Round by round/u }));
    expect(screen.queryByText("Preview for tok1")).toBeNull();
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

  it("drops every optional column when the source published bare placings", () => {
    renderStandings(field(2, () => ({ legend: null, champion: null })));

    expect(screen.queryByRole("columnheader", { name: "Legend" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Value" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Decklist" })).not.toBeInTheDocument();
    expect(phoneRow("Player 0").querySelector('[data-slot="card-art-thumb"]')).toBeNull();
  });

  it("prices each archived list once the archive's prices are in", () => {
    archive.costs = new Map([
      ["d1", { needed: 40, owned: undefined, value: 123.4, toComplete: undefined }],
    ]);
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", deckId: "d1", shareToken: "tok1" }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2 }),
    ]);

    expect(screen.getByRole("columnheader", { name: "Value" })).toBeInTheDocument();
    expect(within(phoneRow("Ana")).getByText("123 €")).toBeInTheDocument();
    expect(within(phoneRow("Bo")).queryByText(/€/u)).toBeNull();
  });

  it("leaves the value blank for a list some card of which has no price", () => {
    archive.costs = new Map([
      ["d1", { needed: 40, owned: undefined, value: undefined, toComplete: undefined }],
    ]);
    renderStandings([metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1" })]);

    expect(within(phoneRow("Ana")).queryByText(/€|--/u)).toBeNull();
  });

  it("prices what a signed-in reader is missing under the value", () => {
    session.userId = "u-1";
    archive.costs = new Map([
      ["d1", { needed: 40, owned: 28, value: 123.4, toComplete: 12.5 }],
      ["d2", { needed: 40, owned: 40, value: 80, toComplete: 0 }],
    ]);
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", deckId: "d1", shareToken: "tok1" }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2, deckId: "d2", shareToken: "tok2" }),
    ]);

    expect(archive.withCollection).toContain(true);
    expect(within(phoneRow("Ana")).getByText("13 € missing")).toBeInTheDocument();
    expect(within(phoneRow("Bo")).getByText("Buildable")).toBeInTheDocument();
  });

  it("prices the list alone for a signed-out reader", () => {
    archive.costs = new Map([
      ["d1", { needed: 40, owned: undefined, value: 123.4, toComplete: undefined }],
    ]);
    renderStandings([metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1" })]);

    expect(archive.withCollection).not.toContain(true);
    expect(within(phoneRow("Ana")).queryByText(/missing|Buildable/u)).toBeNull();
  });

  it("keeps the value column out of a field with no list on file", () => {
    session.userId = "u-1";
    renderStandings(field(2));

    expect(screen.queryByRole("columnheader", { name: "Value" })).not.toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Decklist" })).toBeInTheDocument();
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

  it("marks a linked list that is only partial in place of the decklist label", async () => {
    const user = userEvent.setup();
    renderStandings([
      metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1", listStatus: "partial" }),
    ]);
    expect(within(phoneRow("Ana")).queryByText("Decklist")).toBeNull();
    expect(within(phoneRow("Ana")).queryByRole("button")).toBeNull();

    await user.click(within(phoneRow("Ana")).getByText("Partial list"));
    expect(within(phoneRow("Ana")).getByText("Preview for tok1")).toBeInTheDocument();
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
    await user.click(within(phoneRow("Ana")).getByText("Decklist"));
    expect(within(phoneRow("Ana")).getByText("Preview for tok1")).toBeInTheDocument();
  });

  it("opens and closes a decklist from the keyboard", async () => {
    const user = userEvent.setup();
    renderStandings([metaPlayer({ playerName: "Ana", shareToken: "tok1" })]);

    const row = phoneRow("Ana");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    row.focus();
    await user.keyboard("{Enter}");
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(within(row).getByText("Preview for tok1")).toBeInTheDocument();

    await user.keyboard(" ");
    expect(screen.queryByText("Preview for tok1")).toBeNull();
  });

  it("gives a list-less row no disclosure to focus", () => {
    renderStandings([metaPlayer({ playerName: "Ana" })]);
    expect(phoneRow("Ana").hasAttribute("tabindex")).toBe(false);
    expect(phoneRow("Ana").hasAttribute("aria-expanded")).toBe(false);
  });

  it("opens and closes a decklist from anywhere on the row", async () => {
    const user = userEvent.setup();
    renderStandings([metaPlayer({ playerName: "Ana", shareToken: "tok1" })]);

    await user.click(within(phoneRow("Ana")).getByText("6-1-0"));
    expect(within(phoneRow("Ana")).getByText("Preview for tok1")).toBeInTheDocument();

    await user.click(within(phoneRow("Ana")).getByText("6-1-0"));
    expect(screen.queryByText("Preview for tok1")).toBeNull();
  });

  it("leaves a row's own links clickable", async () => {
    const user = userEvent.setup();
    renderStandings([metaPlayer({ playerName: "Ana", shareToken: "tok1" })]);

    await user.click(within(phoneRow("Ana")).getByRole("link", { name: /Yasuo/u }));
    expect(screen.queryByText("Preview for tok1")).toBeNull();
  });

  it("sends a player the archive has a page for to it, in both renderings", () => {
    renderStandings([metaPlayer({ playerName: "Ana", playerKey: "u1001" })]);

    const links = screen.getAllByRole("link", { name: "Ana" });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute("href", "/meta/players/u1001");
    }
  });

  it("prints a player the source filed under no identity as plain text", () => {
    renderStandings([metaPlayer({ playerName: "Ana", playerKey: null })]);

    expect(screen.queryByRole("link", { name: "Ana" })).toBeNull();
    expect(within(phoneRow("Ana")).getByText("Ana")).toBeInTheDocument();
  });

  it("closes an open decklist when another one opens", async () => {
    const user = userEvent.setup();
    renderStandings([
      metaPlayer({ id: "p-1", playerName: "Ana", rank: 1, shareToken: "tok1" }),
      metaPlayer({ id: "p-2", playerName: "Bo", rank: 2, shareToken: "tok2" }),
    ]);

    await user.click(within(phoneRow("Ana")).getByText("Decklist"));
    await user.click(within(phoneRow("Bo")).getByText("Decklist"));

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

  it("mounts only the rows a long field puts in view", () => {
    renderStandings(field(200));

    expect(phoneRow("Player 0")).toBeInTheDocument();
    expect(screen.queryByText("Player 199")).toBeNull();
  });

  it("reserves the whole field's height so the scrollbar stays honest", () => {
    renderStandings(field(200));

    // oxlint-disable-next-line unicorn/prefer-number-coercion -- style.height carries a "px" suffix, which Number() cannot parse
    const reserved = Number.parseInt(screen.getByRole("list").style.height, 10);
    expect(reserved).toBeGreaterThan(200 * 40);
  });

  it("shrinks the reserved height to the narrowed field", async () => {
    const user = userEvent.setup();
    renderStandings(field(200, (index) => (index < 18 ? { shareToken: `tok-${index}` } : {})));

    // oxlint-disable-next-line unicorn/prefer-number-coercion -- style.height carries a "px" suffix, which Number() cannot parse
    const full = Number.parseInt(screen.getByRole("list").style.height, 10);
    await user.click(screen.getByRole("button", { name: "With decklist (18)" }));

    // oxlint-disable-next-line unicorn/prefer-number-coercion -- style.height carries a "px" suffix, which Number() cannot parse
    expect(Number.parseInt(screen.getByRole("list").style.height, 10)).toBeLessThan(full);
  });

  describe("cost filter", () => {
    /** Two lists a signed-in reader could finish, one they could not, and an entry with none. */
    function pricedField() {
      session.userId = "u-1";
      archive.costs = new Map([
        ["d1", { needed: 40, owned: 20, value: 123.4, toComplete: 12.5 }],
        ["d2", { needed: 40, owned: 40, value: 80, toComplete: 0 }],
        ["d3", { needed: 40, owned: 30, value: 300, toComplete: 5 }],
      ]);
      renderStandings([
        metaPlayer({ id: "p-1", playerName: "Ana", rank: 1, deckId: "d1", shareToken: "tok1" }),
        metaPlayer({ id: "p-2", playerName: "Bo", rank: 2, deckId: "d2", shareToken: "tok2" }),
        metaPlayer({ id: "p-3", playerName: "Cy", rank: 3, deckId: "d3", shareToken: "tok3" }),
        metaPlayer({ id: "p-4", playerName: "Dee", rank: 4 }),
      ]);
    }

    it("keeps the cost filter out of a field with no list on file", () => {
      session.userId = "u-1";
      renderStandings(field(2));

      expect(screen.queryByText("cost trigger: control")).toBeNull();
    });

    it("asks the shared control for a toolbar trigger that talks about lists", () => {
      pricedField();

      expect(screen.getByText("cost trigger: control")).toBeInTheDocument();
      expect(screen.getByText("cost noun: list")).toBeInTheDocument();
    });

    it("holds the cost filter unready until the archive's prices are in", () => {
      renderStandings([metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1" })]);
      expect(screen.getByText("cost ready: false")).toBeInTheDocument();
    });

    it("opens the cost filter once the prices are in", () => {
      pricedField();
      expect(screen.getByText("cost ready: true")).toBeInTheDocument();
    });

    it("tells the control whether a collection stands behind it", () => {
      renderStandings([metaPlayer({ playerName: "Ana", deckId: "d1", shareToken: "tok1" })]);
      expect(screen.getByText("cost collection: false")).toBeInTheDocument();
    });

    it("tells the control a signed-in reader has a collection", () => {
      pricedField();
      expect(screen.getByText("cost collection: true")).toBeInTheDocument();
    });

    it("hides the lists costing more than the bound, and the entries with no list at all", async () => {
      const user = userEvent.setup();
      pricedField();

      await user.click(screen.getByRole("button", { name: "cost bound" }));

      expect(phoneRow("Bo")).toBeInTheDocument();
      expect(phoneRow("Cy")).toBeInTheDocument();
      expect(screen.queryByText("Ana")).toBeNull();
      expect(screen.queryByText("Dee")).toBeNull();
    });

    it("keeps only the lists a reader already owns at a bound of nothing", async () => {
      const user = userEvent.setup();
      pricedField();

      await user.click(screen.getByRole("button", { name: "buildable" }));

      expect(phoneRow("Bo")).toBeInTheDocument();
      expect(screen.queryByText("Cy")).toBeNull();
    });

    it("narrows the field by what a list is worth", async () => {
      const user = userEvent.setup();
      pricedField();

      await user.click(screen.getByRole("button", { name: "value bound" }));

      expect(phoneRow("Bo")).toBeInTheDocument();
      expect(screen.queryByText("Ana")).toBeNull();
      expect(screen.queryByText("Cy")).toBeNull();
    });

    it("gives the whole field back when the cost filter is cleared", async () => {
      const user = userEvent.setup();
      pricedField();

      await user.click(screen.getByRole("button", { name: "cost bound" }));
      await user.click(screen.getByRole("button", { name: "clear cost" }));

      expect(phoneRow("Ana")).toBeInTheDocument();
      expect(phoneRow("Dee")).toBeInTheDocument();
    });

    it("counts a bound against the value range already in force, not against the raw field", async () => {
      const user = userEvent.setup();
      pricedField();

      expect(screen.getByText("cost matches: 2")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "value bound" }));
      expect(screen.getByText("cost matches: 1")).toBeInTheDocument();
    });

    it("scales the control against this event's own lists", () => {
      pricedField();

      expect(screen.getByText("cost ceiling: 300")).toBeInTheDocument();
      expect(screen.getByText("completion ceiling: 12.5")).toBeInTheDocument();
    });

    it("prices the sideboard in by default, the way the value column does", () => {
      pricedField();

      expect(screen.getByText("cost sideboard: true")).toBeInTheDocument();
      expect(archive.includeSideboard.at(-1)).toBe(true);
    });

    it("reprices the field without the sideboard when the reader drops it", async () => {
      const user = userEvent.setup();
      pricedField();

      await user.click(screen.getByRole("button", { name: "drop sideboard" }));

      expect(screen.getByText("cost sideboard: false")).toBeInTheDocument();
      expect(archive.includeSideboard.at(-1)).toBe(false);
    });
  });
});
