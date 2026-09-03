import type { MetaUploadSummary } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const captured = {
  uploads: [] as MetaUploadSummary[],
  suggestions: [] as unknown[],
  reverted: [] as { provider: string; externalId: string }[],
  moved: [] as { id: string; metaEventId: string }[],
};

vi.mock("@/hooks/use-admin-meta-overlays", () => ({
  useMetaEventUploads: () => ({ data: { uploads: captured.uploads } }),
  useMetaEventMatchSuggestions: () => ({
    data: { suggestions: captured.suggestions, windowDays: 3 },
    isPending: false,
  }),
  useMoveMetaEventOverlay: () => ({
    mutateAsync: (input: { id: string; metaEventId: string }) => {
      captured.moved.push(input);
      return Promise.resolve({ metaEventId: input.metaEventId, created: false });
    },
    isPending: false,
  }),
  useRevertMetaUpload: () => ({
    mutateAsync: (input: { provider: string; externalId: string }) => {
      captured.reverted.push(input);
      return Promise.resolve({ metaEventIds: ["e1"], players: 3, eventRejected: true });
    },
    isPending: false,
  }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaEventUploadsPanel } from "./meta-event-uploads-panel";

function upload(overrides: Partial<MetaUploadSummary> = {}): MetaUploadSummary {
  return {
    eventOverlayId: "overlay-1",
    provider: "playriftbound",
    externalId: "hartfords-top-decks",
    status: "accepted",
    acceptedAt: "2026-09-01T10:00:00.000Z",
    acceptedPlayers: 37,
    pendingPlayers: 4,
    mintedPlayers: 2,
    ...overrides,
  };
}

describe("MetaEventUploadsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.uploads = [upload()];
    captured.suggestions = [];
    captured.reverted = [];
    captured.moved = [];
  });

  it("says nothing for an event no upload feeds", () => {
    captured.uploads = [];
    const { container } = render(<MetaEventUploadsPanel eventId="event-1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("names the upload and what it did to the event", () => {
    render(<MetaEventUploadsPanel eventId="event-1" />);

    expect(screen.getByText("hartfords-top-decks")).toBeInTheDocument();
    expect(screen.getByText(/37 applied/u)).toBeInTheDocument();
    expect(screen.getByText(/2 standings rows it minted/u)).toBeInTheDocument();
  });

  it("reverts the whole upload by its source key", async () => {
    render(<MetaEventUploadsPanel eventId="event-1" />);

    await userEvent.click(screen.getByRole("button", { name: /Revert this upload/u }));
    await userEvent.click(screen.getByRole("button", { name: "Revert" }));

    expect(captured.reverted).toEqual([
      { provider: "playriftbound", externalId: "hartfords-top-decks" },
    ]);
  });

  it("moves the upload onto the event a suggestion names", async () => {
    captured.suggestions = [
      {
        metaEventId: "event-2",
        slug: "rq-hartford-2026",
        name: "RQ Hartford",
        eventDate: "2026-06-20",
        format: "constructed",
        playerRowCount: 1954,
        score: 9,
        reasons: ["same date", "similar name"],
      },
    ];

    render(<MetaEventUploadsPanel eventId="event-1" />);
    await userEvent.click(screen.getByRole("button", { name: /Move to another event/u }));
    await userEvent.click(screen.getByRole("button", { name: /Move here/u }));

    expect(captured.moved).toEqual([{ id: "overlay-1", metaEventId: "event-2" }]);
  });
});
