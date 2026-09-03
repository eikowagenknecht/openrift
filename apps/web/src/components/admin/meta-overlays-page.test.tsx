import type { MetaOverlayQueueRow, MetaOverlayRowMatch } from "@openrift/shared";
import type { AdminMetaEventCorrection } from "@openrift/shared/contracts/admin/meta-submissions";
import type * as Router from "@tanstack/react-router";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The top bar reaches for the admin sidebar context, which this page does not
// otherwise need.
vi.mock("@/components/admin/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

// The group's "Open event" link needs no router to render as an anchor.
vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  Link: ({ children }: { children?: ReactNode }) => <a href="/admin/meta/e1">{children}</a>,
}));

const captured = {
  overlays: [] as unknown[],
  corrections: [] as unknown[],
  acceptedEvent: [] as { id: string; metaEventId: string | null }[],
  acceptedPlayer: [] as { id: string; metaEventPlayerId: string | null }[],
  acceptedBulk: [] as { id: string; metaEventPlayerId: string | null }[][],
  rejected: [] as { kind: string; id: string }[],
  linked: [] as { id: string; metaEventPlayerId: string }[],
  eventSuggestions: [] as unknown[],
  playerSuggestions: [] as unknown[],
  windowDays: 3,
  acceptFails: false,
  ignoredEvents: [] as { provider: string; externalId: string }[],
  ignoredPlayers: [] as { provider: string; eventExternalId: string; externalId: string }[],
};

vi.mock("@/hooks/use-admin-meta-overlays", () => ({
  useAdminMetaOverlays: () => ({ data: { overlays: captured.overlays } }),
  useAcceptMetaEventOverlay: () => ({
    mutateAsync: (input: { id: string; metaEventId: string | null }) => {
      captured.acceptedEvent.push(input);
      return Promise.resolve({ metaEventId: "e1", created: false });
    },
    isPending: false,
  }),
  useAcceptMetaPlayerOverlay: () => ({
    mutateAsync: (input: { id: string; metaEventPlayerId: string | null }) => {
      if (captured.acceptFails) {
        return Promise.reject(new Error("nope"));
      }
      captured.acceptedPlayer.push(input);
      return Promise.resolve({ metaEventId: "e1", created: false });
    },
    isPending: false,
  }),
  useAcceptMetaPlayerOverlays: () => ({
    mutateAsync: (input: { items: { id: string; metaEventPlayerId: string | null }[] }) => {
      captured.acceptedBulk.push(input.items);
      return Promise.resolve({ accepted: input.items.length, metaEventIds: ["e1"] });
    },
    isPending: false,
  }),
  useRejectMetaOverlay: () => ({
    mutateAsync: (input: { kind: string; id: string }) => {
      captured.rejected.push(input);
      return Promise.resolve({ metaEventId: null, created: false });
    },
    isPending: false,
  }),
  useLinkMetaPlayerOverlay: () => ({
    mutateAsync: (input: { id: string; metaEventPlayerId: string }) => {
      captured.linked.push(input);
      return Promise.resolve({ metaEventId: "e1", created: false });
    },
    isPending: false,
  }),
  useIgnoreMetaSourceEvent: () => ({
    mutateAsync: (input: { provider: string; externalId: string }) => {
      captured.ignoredEvents.push(input);
      return Promise.resolve();
    },
    isPending: false,
  }),
  useIgnoreMetaSourcePlayer: () => ({
    mutateAsync: (input: { provider: string; eventExternalId: string; externalId: string }) => {
      captured.ignoredPlayers.push(input);
      return Promise.resolve();
    },
    isPending: false,
  }),
  useMetaEventMatchSuggestions: () => ({
    data: { suggestions: captured.eventSuggestions, windowDays: captured.windowDays },
    isPending: false,
  }),
  useMetaPlayerMatchSuggestions: () => ({
    data: { suggestions: captured.playerSuggestions },
    isPending: false,
  }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useZoneOrder: () => ({
    zoneOrder: ["legend", "champion", "main", "runes", "battlefield", "sideboard"],
    zoneLabels: {
      legend: "Legend",
      champion: "Chosen Champion",
      main: "Main Deck",
      runes: "Runes",
      battlefield: "Battlefields",
      sideboard: "Sideboard",
    },
  }),
}));

vi.mock("@/hooks/use-admin-meta-submissions", () => ({
  useMetaSubmissionForPlayerOverlay: () => ({ data: { submission: null } }),
  useMetaEventCorrections: () => ({ data: { items: captured.corrections, hasMore: false } }),
}));

vi.mock("@/components/admin/meta-event-correction-card", () => ({
  MetaEventCorrectionCard: ({ correction }: { correction: AdminMetaEventCorrection }) => (
    <div>{`correction:${correction.submission.id}`}</div>
  ),
}));
vi.mock("@/components/admin/meta-overlay-upload-dialog", () => ({
  MetaOverlayUploadDialog: () => null,
}));
vi.mock("@/components/admin/meta-ignored-sources-dialog", () => ({
  MetaIgnoredSourcesDialog: () => null,
}));
vi.mock("@/components/admin/meta-card-name-picker", () => ({
  MetaCardNamePicker: ({ name }: { name: string }) => <span>{`picker:${name}`}</span>,
}));

const { MetaOverlaysPage } = await import("@/components/admin/meta-overlays-page");

function match(overrides: Partial<MetaOverlayRowMatch> = {}): MetaOverlayRowMatch {
  return {
    state: "linked",
    metaEventPlayerId: "row-1",
    playerName: "Ashe Main",
    rank: 2,
    rankIsTier: false,
    candidateCount: 0,
    ...overrides,
  };
}

function overlay(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return {
    id: "o1",
    kind: "player",
    status: "pending",
    provider: "uvsgames",
    sourceEventExternalId: "evt-1",
    sourcePlayerExternalId: "evt-1-p1",
    eventOverlayId: null,
    metaEventPlayerId: "row-1",
    metaEventId: "e1",
    metaEventName: "Summoner Skirmish",
    metaEventSlug: "summoner-skirmish",
    eventDate: "2026-08-01",
    eventFormat: "constructed",
    proposedName: null,
    playerName: "Ashe Main",
    rank: 4,
    rankIsTier: false,
    match: match(),
    submittedBy: "u1",
    submissionNote: null,
    changes: [{ field: "rank", from: "4", to: "2" }],
    cards: [],
    unresolvedNames: [],
    createdAt: "2026-08-30T10:00:00.000Z",
    ...overrides,
  };
}

/** An unanchored standings overlay whose match is what the test says. */
function loose(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return overlay({
    metaEventPlayerId: null,
    match: match({ state: "none", metaEventPlayerId: null, playerName: null, rank: null }),
    ...overrides,
  });
}

function proposal(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return overlay({
    kind: "event",
    metaEventId: null,
    metaEventName: null,
    metaEventSlug: null,
    metaEventPlayerId: null,
    sourcePlayerExternalId: null,
    proposedName: "Brand New",
    playerName: null,
    rank: null,
    rankIsTier: null,
    match: null,
    ...overrides,
  });
}

function correctionFor(id: string, eventId: string | null): AdminMetaEventCorrection {
  return {
    submission: {
      id,
      eventName: "Summoner Skirmish",
      playerName: null,
      kind: "event_correction",
      note: null,
      status: "pending",
      reason: null,
      resolutionNote: null,
      acceptedDeckId: null,
      createdAt: "2026-08-29T10:00:00.000Z",
      resolvedAt: null,
    },
    event:
      eventId === null
        ? null
        : {
            id: eventId,
            slug: "summoner-skirmish",
            name: "Summoner Skirmish",
            eventDate: "2026-08-01",
            format: "constructed",
            playerCount: 64,
            organizer: null,
            location: null,
            country: null,
          },
    fieldEdits: {},
  };
}

async function expandRow(name: string): Promise<void> {
  await userEvent.click(screen.getByRole("button", { name: `Expand ${name}` }));
}

beforeEach(() => {
  captured.overlays = [];
  captured.corrections = [];
  captured.acceptedEvent = [];
  captured.acceptedPlayer = [];
  captured.acceptedBulk = [];
  captured.rejected = [];
  captured.linked = [];
  captured.eventSuggestions = [];
  captured.playerSuggestions = [];
  captured.windowDays = 3;
  captured.acceptFails = false;
  captured.ignoredEvents = [];
  captured.ignoredPlayers = [];
});

describe("MetaOverlaysPage", () => {
  it("says so when nothing is waiting", () => {
    render(<MetaOverlaysPage />);

    expect(screen.getByText("Nothing waiting.")).toBeInTheDocument();
  });

  it("groups every row under the event it lands on, with the event's facts", () => {
    captured.overlays = [
      overlay({ id: "a", playerName: "Ashe Main" }),
      overlay({ id: "b", playerName: "Jinx Fan", rank: 9 }),
      overlay({ id: "c", metaEventId: "e2", metaEventName: "Other Night", playerName: "Zed" }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByRole("button", { name: "Collapse Summoner Skirmish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse Other Night" })).toBeInTheDocument();
    expect(screen.getByText("2 decklists")).toBeInTheDocument();
    expect(screen.getAllByText("constructed")).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: "Open event" })).toHaveLength(2);
  });

  it("folds a correction into its event's group", () => {
    captured.overlays = [overlay()];
    captured.corrections = [correctionFor("s1", "e1")];

    render(<MetaOverlaysPage />);

    expect(screen.getAllByRole("button", { name: /^Collapse/u })).toHaveLength(1);
    expect(screen.getByText("correction:s1")).toBeInTheDocument();
    expect(screen.getByText("1 decklist · 1 correction")).toBeInTheDocument();
  });

  it("counts the queue by what the admin has to decide", () => {
    captured.overlays = [
      overlay({ id: "ready" }),
      loose({ id: "loose", playerName: "Loose" }),
      overlay({ id: "unmatched", playerName: "Unmatched", unresolvedNames: ["Mystery"] }),
      proposal({ id: "prop" }),
    ];
    captured.corrections = [correctionFor("s1", "e1")];

    render(<MetaOverlaysPage />);

    expect(screen.getByRole("button", { name: /^All ?5$/u })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /^Ready ?1$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Needs a row ?1$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Unmatched cards ?1$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^New events ?1$/u })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Corrections ?1$/u })).toBeInTheDocument();
  });

  it("narrows the page to one triage when its chip is pressed", async () => {
    captured.overlays = [
      overlay({ id: "ready", playerName: "Ready Player" }),
      loose({ id: "loose", playerName: "Loose Player" }),
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: /^Needs a row ?1$/u }));

    expect(screen.getByText("Loose Player")).toBeInTheDocument();
    expect(screen.queryByText("Ready Player")).not.toBeInTheDocument();
  });

  it("reads an exact match as ready, and links it on accept", async () => {
    captured.overlays = [
      loose({
        id: "p1",
        match: match({ state: "exact", metaEventPlayerId: "row-5", playerName: "Ashe Main" }),
      }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("exact match")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(captured.acceptedPlayer).toEqual([{ id: "p1", metaEventPlayerId: "row-5" }]);
  });

  it("accepts a linked entry without a warning and without relinking it", async () => {
    captured.overlays = [overlay({ id: "p5" })];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(captured.acceptedPlayer).toEqual([{ id: "p5", metaEventPlayerId: null }]);
  });

  it("warns before filing a second standings row for an unlinked entry", async () => {
    captured.overlays = [loose({ id: "p6" })];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept as new row" }));

    expect(captured.acceptedPlayer).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "File a new row" }));
    expect(captured.acceptedPlayer).toEqual([{ id: "p6", metaEventPlayerId: null }]);
  });

  it("offers no accept on a row whose event is still only proposed", () => {
    captured.overlays = [loose({ match: match({ state: "unscored" }) })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("accept the event first")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Accept/u })).not.toBeInTheDocument();
  });

  it("accepts every ready row of a group in one call, linking the exact matches", async () => {
    captured.overlays = [
      overlay({ id: "linked" }),
      loose({
        id: "exact",
        playerName: "Exact",
        match: match({ state: "exact", metaEventPlayerId: "row-9", playerName: "Exact" }),
      }),
      loose({ id: "loose", playerName: "Loose" }),
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept 2 ready" }));
    await userEvent.click(screen.getByRole("button", { name: "Accept all" }));

    expect(captured.acceptedBulk).toEqual([
      [
        { id: "linked", metaEventPlayerId: null },
        { id: "exact", metaEventPlayerId: "row-9" },
      ],
    ]);
  });

  it("offers no bulk accept when nothing in the group is ready", () => {
    captured.overlays = [loose()];

    render(<MetaOverlaysPage />);

    expect(screen.queryByRole("button", { name: /ready$/u })).not.toBeInTheDocument();
  });

  it("folds ready rows past the first few behind a count, keeping the rest in view", async () => {
    captured.overlays = [
      ...Array.from({ length: 7 }, (_, index) =>
        overlay({ id: `r${index}`, playerName: `Ready ${index}`, rank: index + 1 }),
      ),
      loose({ id: "loose", playerName: "Loose Player", rank: 40 }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("Loose Player")).toBeInTheDocument();
    expect(screen.queryByText("Ready 6")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(screen.getByText("Ready 6")).toBeInTheDocument();
  });

  it("orders a group's rows by finish", () => {
    captured.overlays = [
      overlay({ id: "b", playerName: "Second", rank: 12 }),
      overlay({ id: "a", playerName: "First", rank: 3 }),
    ];

    render(<MetaOverlaysPage />);

    const rows = screen.getAllByRole("row").slice(1);
    expect(within(rows[0]).getByText("First")).toBeInTheDocument();
    expect(within(rows[1]).getByText("Second")).toBeInTheDocument();
  });

  it("shows each claimed field as a before and after once the row is opened", async () => {
    captured.overlays = [overlay()];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");

    expect(screen.getByText("rank")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders a cleared field as empty rather than blank", async () => {
    captured.overlays = [
      overlay({ changes: [{ field: "organizer", from: "LGS Berlin", to: null }] }),
    ];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("hides a claim that repeats what the live row already holds", async () => {
    captured.overlays = [
      overlay({
        changes: [
          { field: "playerName", from: "linsanity", to: "linsanity" },
          { field: "listStatus", from: "none", to: "full" },
        ],
      }),
    ];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");

    expect(screen.queryByText("playerName")).not.toBeInTheDocument();
    expect(screen.getByText("listStatus")).toBeInTheDocument();
  });

  it("names the provider a group's rows came from", () => {
    captured.overlays = [overlay({ provider: "playloltcg" })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("playloltcg")).toBeInTheDocument();
  });

  it("marks a person's row as a submission, both on the group and the row", () => {
    captured.overlays = [overlay({ provider: null })];

    render(<MetaOverlaysPage />);

    expect(screen.getAllByText("User submission")).toHaveLength(2);
  });

  it("counts the unmatched names in the row, so it need not be opened", () => {
    captured.overlays = [overlay({ unresolvedNames: ["A", "B"] })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("2 unmatched")).toBeInTheDocument();
  });

  it("offers a card picker for every name that matches nothing", async () => {
    captured.overlays = [
      overlay({
        cards: [
          { lineNumber: 0, zone: "main", quantity: 2, cardName: "Unknown Card", cardId: null },
        ],
        unresolvedNames: ["Unknown Card"],
      }),
    ];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");

    expect(screen.getByText(/match nothing in the catalog/u)).toBeInTheDocument();
    expect(screen.getByText("picker:Unknown Card")).toBeInTheDocument();
  });

  it("asks again before accepting a list whose cards match nothing", async () => {
    captured.overlays = [
      overlay({
        id: "p9",
        cards: [{ lineNumber: 0, zone: "main", quantity: 1, cardName: "Mystery", cardId: null }],
        unresolvedNames: ["Mystery"],
      }),
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(captured.acceptedPlayer).toEqual([]);
    expect(screen.getByText(/lands as a standings row with no decklist/u)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Accept without a deck" }));
    expect(captured.acceptedPlayer).toEqual([{ id: "p9", metaEventPlayerId: null }]);
  });

  it("drops back to a plain Accept when the confirmed accept fails", async () => {
    captured.acceptFails = true;
    captured.overlays = [
      overlay({
        id: "p7",
        cards: [{ lineNumber: 0, zone: "main", quantity: 1, cardName: "Mystery", cardId: null }],
        unresolvedNames: ["Mystery"],
      }),
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));
    await userEvent.click(screen.getByRole("button", { name: "Accept without a deck" }));

    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("rejects a standings row with its kind, so the right table is settled", async () => {
    captured.overlays = [overlay({ id: "p2" })];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(captured.rejected).toEqual([{ kind: "player", id: "p2" }]);
  });

  it("rejects a proposal with the event kind", async () => {
    captured.overlays = [proposal({ id: "e9" })];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(captured.rejected).toEqual([{ kind: "event", id: "e9" }]);
  });

  it("marks a proposal as a new event and leads the queue with it", () => {
    captured.overlays = [
      overlay({ id: "old", createdAt: "2026-08-01T00:00:00.000Z" }),
      proposal({ createdAt: "2026-08-31T00:00:00.000Z" }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("new event")).toBeInTheDocument();
    const toggles = screen.getAllByRole("button", { name: /^Collapse/u });
    expect(toggles[0]).toHaveAccessibleName("Collapse Brand New");
  });

  it("names the search window when a proposal matches no archived event", () => {
    captured.windowDays = 5;
    captured.overlays = [proposal()];

    render(<MetaOverlaysPage />);

    expect(screen.getByText(/within 5 days/u)).toBeInTheDocument();
  });

  it("accepts a proposal into a suggested event instead of minting a duplicate", async () => {
    captured.overlays = [proposal({ id: "e5" })];
    captured.eventSuggestions = [
      {
        metaEventId: "live-1",
        slug: "summoner-skirmish",
        name: "Summoner Skirmish",
        eventDate: "2026-08-30",
        format: "standard",
        playerRowCount: 32,
        score: 9,
        reasons: ["same day", "name matches"],
      },
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept into this" }));

    expect(captured.acceptedEvent).toEqual([{ id: "e5", metaEventId: "live-1" }]);
  });

  it("mints a new event only after the warning is confirmed", async () => {
    captured.overlays = [proposal({ id: "e6" })];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept as new" }));

    expect(captured.acceptedEvent).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Mint a new event" }));
    expect(captured.acceptedEvent).toEqual([{ id: "e6", metaEventId: null }]);
  });

  it("leads with the exact event match, so the case with no judgement in it stands out", () => {
    captured.overlays = [proposal({ id: "e7" })];
    captured.eventSuggestions = [
      {
        metaEventId: "live-1",
        slug: "summoner-skirmish",
        name: "Summoner Skirmish",
        eventDate: "2026-08-30",
        format: "constructed",
        playerRowCount: 32,
        score: 10,
        reasons: ["same format", "same date", "same name"],
        isExact: true,
      },
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByRole("button", { name: "Accept into this" })).toHaveClass("bg-primary");
  });

  it("keeps a proposal's own standings rows under it", () => {
    captured.overlays = [
      proposal({ id: "prop" }),
      loose({
        id: "rider",
        playerName: "Rider",
        metaEventId: null,
        metaEventName: null,
        eventOverlayId: "prop",
        match: match({ state: "unscored" }),
      }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getAllByRole("button", { name: /^Collapse/u })).toHaveLength(1);
    expect(screen.getByText("Rider")).toBeInTheDocument();
  });

  it("groups a decklist under one heading per zone", async () => {
    captured.overlays = [
      overlay({
        cards: [
          { lineNumber: 0, zone: "main", quantity: 3, cardName: "Sabotage", cardId: "c1" },
          { lineNumber: 1, zone: "legend", quantity: 1, cardName: "Master Yi", cardId: "c2" },
          { lineNumber: 2, zone: "main", quantity: 2, cardName: "First Mate", cardId: "c3" },
        ],
      }),
    ];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");

    expect(screen.getByText("Legend · 1")).toBeInTheDocument();
    expect(screen.getByText("Main Deck · 5")).toBeInTheDocument();
  });

  it("dismisses an event row by the provider's own event key", async () => {
    captured.overlays = [
      overlay({
        kind: "event",
        sourceEventExternalId: "evt-9",
        sourcePlayerExternalId: null,
        metaEventPlayerId: null,
        match: null,
      }),
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: /Dismiss this source key/u }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(captured.ignoredEvents).toEqual([{ provider: "uvsgames", externalId: "evt-9" }]);
    expect(captured.ignoredPlayers).toEqual([]);
  });

  it("dismisses a player row with the key scoped to its event", async () => {
    captured.overlays = [
      overlay({ sourceEventExternalId: "evt-9", sourcePlayerExternalId: "evt-9-p2" }),
    ];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");
    await userEvent.click(screen.getByRole("button", { name: /Dismiss this source key/u }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(captured.ignoredPlayers).toEqual([
      { provider: "uvsgames", eventExternalId: "evt-9", externalId: "evt-9-p2" },
    ]);
    expect(captured.ignoredEvents).toEqual([]);
  });

  it("offers no dismiss on a person's overlay, which carries no source key", async () => {
    captured.overlays = [
      overlay({ provider: null, sourceEventExternalId: null, sourcePlayerExternalId: null }),
    ];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");

    expect(
      screen.queryByRole("button", { name: /Dismiss this source key/u }),
    ).not.toBeInTheDocument();
  });

  it("marks an anchored overlay as linked and still offers to move it", async () => {
    captured.overlays = [overlay({ metaEventPlayerId: "row-7" })];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");

    expect(screen.getByText("linked")).toBeInTheDocument();
    expect(screen.getByText(/Pick another row to move it/u)).toBeInTheDocument();
    expect(screen.queryByText(/accepting files a new one/u)).not.toBeInTheDocument();
  });

  it("links a standings overlay to the row a suggestion names", async () => {
    captured.overlays = [loose({ id: "p3" })];
    captured.playerSuggestions = [
      {
        metaEventPlayerId: "row-1",
        playerName: "Ashe Main",
        rank: 2,
        rankIsTier: false,
        deckId: null,
        score: 7,
        reasons: ["name matches"],
      },
    ];

    render(<MetaOverlaysPage />);
    await expandRow("Ashe Main");
    await userEvent.click(screen.getByRole("button", { name: "Link to this entry" }));

    expect(captured.linked).toEqual([{ id: "p3", metaEventPlayerId: "row-1" }]);
  });

  it("collapses a group without losing it", async () => {
    captured.overlays = [overlay()];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Collapse Summoner Skirmish" }));

    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Expand Summoner Skirmish" })).toBeInTheDocument();
  });
});
