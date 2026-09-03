import type { MetaOverlayQueueRow } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

// The top bar reaches for the admin sidebar context, which this page does not
// otherwise need.
vi.mock("@/components/admin/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

const captured = {
  overlays: [] as unknown[],
  acceptedEvent: [] as { id: string; metaEventId: string | null }[],
  acceptedPlayer: [] as string[],
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
    mutateAsync: (id: string) => {
      if (captured.acceptFails) {
        return Promise.reject(new Error("nope"));
      }
      captured.acceptedPlayer.push(id);
      return Promise.resolve({ metaEventId: "e1", created: false });
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

vi.mock("@/hooks/use-admin-meta-submissions", () => ({
  useMetaSubmissionForPlayerOverlay: () => ({ data: { submission: null } }),
}));

// The corrections panel is its own query and its own subject; this file is
// about the overlay queue's cards.
vi.mock("@/components/admin/meta-event-corrections-panel", () => ({
  MetaEventCorrectionsPanel: () => null,
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

function overlay(overrides: Partial<MetaOverlayQueueRow> = {}): MetaOverlayQueueRow {
  return {
    id: "o1",
    kind: "player",
    status: "pending",
    provider: "uvsgames",
    sourceEventExternalId: "evt-1",
    sourcePlayerExternalId: "evt-1-p1",
    metaEventPlayerId: "row-1",
    metaEventId: "e1",
    metaEventName: "Summoner Skirmish",
    proposedName: null,
    playerName: "Ashe Main",
    submittedBy: "u1",
    submissionNote: null,
    changes: [{ field: "rank", from: "4", to: "2" }],
    cards: [],
    unresolvedNames: [],
    createdAt: "2026-08-30T10:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  captured.overlays = [];
  captured.acceptedEvent = [];
  captured.acceptedPlayer = [];
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

  it("shows each claimed field as a before and after", () => {
    captured.overlays = [overlay()];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("rank")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders a cleared field as empty rather than blank", () => {
    captured.overlays = [
      overlay({ changes: [{ field: "organizer", from: "LGS Berlin", to: null }] }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("empty")).toBeInTheDocument();
  });

  it("names the provider a scraped overlay came from", () => {
    captured.overlays = [overlay({ provider: "playloltcg" })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("playloltcg")).toBeInTheDocument();
  });

  it("names a person's overlay rather than leaving its provider blank", () => {
    captured.overlays = [overlay({ provider: null })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("User submission")).toBeInTheDocument();
  });

  it("offers a card picker for every name that matches nothing", () => {
    captured.overlays = [
      overlay({
        cards: [
          { lineNumber: 0, zone: "main", quantity: 2, cardName: "Unknown Card", cardId: null },
        ],
        unresolvedNames: ["Unknown Card"],
      }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByText(/match nothing in the catalog/u)).toBeInTheDocument();
    expect(screen.getByText("picker:Unknown Card")).toBeInTheDocument();
  });

  it("routes accept to the handler for the overlay's kind", async () => {
    captured.overlays = [overlay({ id: "p1", kind: "player" })];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(captured.acceptedPlayer).toEqual(["p1"]);
    expect(captured.acceptedEvent).toEqual([]);
  });

  it("rejects with the overlay's kind, so the right table is settled", async () => {
    captured.overlays = [overlay({ id: "e9", kind: "event", proposedName: "Proposed" })];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Reject" }));

    expect(captured.rejected).toEqual([{ kind: "event", id: "e9" }]);
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

    // The first click only warns: accepting would file a standings row and
    // silently drop the deck.
    expect(captured.acceptedPlayer).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "Accept without a deck" }));
    expect(captured.acceptedPlayer).toEqual(["p9"]);
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

  it("accepts a fully matched list on the first click", async () => {
    captured.overlays = [
      overlay({
        id: "p8",
        cards: [{ lineNumber: 0, zone: "main", quantity: 1, cardName: "Known", cardId: "card-1" }],
      }),
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(captured.acceptedPlayer).toEqual(["p8"]);
  });

  it("counts the unmatched names in the header, so the card need not be expanded", () => {
    captured.overlays = [overlay({ unresolvedNames: ["A", "B"] })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("2 unmatched")).toBeInTheDocument();
  });

  it("marks an overlay with no live target as a new event", () => {
    captured.overlays = [
      overlay({ kind: "event", metaEventId: null, metaEventName: null, proposedName: "Brand New" }),
    ];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("new event")).toBeInTheDocument();
  });

  it("names the search window when a proposal matches no archived event", () => {
    captured.windowDays = 5;
    captured.overlays = [overlay({ kind: "event", metaEventId: null, proposedName: "Brand New" })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText(/within 5 days/u)).toBeInTheDocument();
  });

  it("accepts a proposal into a suggested event instead of minting a duplicate", async () => {
    captured.overlays = [
      overlay({ id: "e5", kind: "event", metaEventId: null, proposedName: "Brand New" }),
    ];
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

  it("mints a new event when a proposal is accepted with the plain button", async () => {
    captured.overlays = [
      overlay({ id: "e6", kind: "event", metaEventId: null, proposedName: "Brand New" }),
    ];

    render(<MetaOverlaysPage />);
    await userEvent.click(screen.getByRole("button", { name: "Accept" }));

    expect(captured.acceptedEvent).toEqual([{ id: "e6", metaEventId: null }]);
  });

  it("dismisses an event row by the provider's own event key", async () => {
    captured.overlays = [
      overlay({
        kind: "event",
        sourceEventExternalId: "evt-9",
        sourcePlayerExternalId: null,
        metaEventPlayerId: null,
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
    await userEvent.click(screen.getByRole("button", { name: /Dismiss this source key/u }));
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(captured.ignoredPlayers).toEqual([
      { provider: "uvsgames", eventExternalId: "evt-9", externalId: "evt-9-p2" },
    ]);
    expect(captured.ignoredEvents).toEqual([]);
  });

  it("offers no dismiss on a person's overlay, which carries no source key", () => {
    captured.overlays = [
      overlay({ provider: null, sourceEventExternalId: null, sourcePlayerExternalId: null }),
    ];

    render(<MetaOverlaysPage />);

    expect(
      screen.queryByRole("button", { name: /Dismiss this source key/u }),
    ).not.toBeInTheDocument();
  });

  it("marks an anchored overlay as linked and still offers the link panel", () => {
    captured.overlays = [overlay({ metaEventPlayerId: "row-7" })];

    render(<MetaOverlaysPage />);

    expect(screen.getByText("linked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Link to a standings row/u })).toBeInTheDocument();
  });

  it("links a standings overlay to the row a suggestion names", async () => {
    captured.overlays = [overlay({ id: "p3", metaEventPlayerId: null })];
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
    await userEvent.click(screen.getByRole("button", { name: /Link to a standings row/u }));
    await userEvent.click(screen.getByRole("button", { name: "Link to this entry" }));

    expect(captured.linked).toEqual([{ id: "p3", metaEventPlayerId: "row-1" }]);
  });
});
