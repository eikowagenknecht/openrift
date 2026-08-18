import type { AdminMetaEvent, MetaCandidateSource } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { MetaCandidateDetailView } from "@/hooks/use-admin-meta-candidates";

const captured = vi.hoisted(() => ({
  candidate: null as unknown,
  acceptWithDecks: vi.fn(),
  acceptEvent: vi.fn(),
  unlinkEvent: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { success: captured.toastSuccess, error: captured.toastError },
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
  // `page-top-bar` builds its back button with createLink at module scope.
  createLink: (component: unknown) => component,
}));

vi.mock("@/components/admin/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/components/admin/meta-candidate-link-panel", () => ({
  MetaCandidateLinkPanel: () => null,
}));

vi.mock("@/components/admin/meta-candidate-event-grid", () => ({
  MetaCandidateEventGrid: () => <div data-testid="grid" />,
}));

vi.mock("@/components/admin/meta-deck-roster", () => ({
  MetaDeckRoster: () => <div data-testid="roster" />,
}));

vi.mock("@/components/admin/meta-candidate-deck-panel", () => ({
  MetaCandidateDeckPanel: () => <div data-testid="deck-panel" />,
}));

vi.mock("@/components/admin/meta-public-link", () => ({
  MetaPublicLinkButton: ({ label }: { label: string }) => <span>{label}</span>,
}));

const event: AdminMetaEvent = {
  id: "event-1",
  slug: "summoner-skirmish-2026",
  name: "Summoner Skirmish 2026",
  eventDate: "2026-08-15",
  format: "standard",
  playerCount: 64,
  organizer: null,
  notes: null,
  deckCount: 8,
};

vi.mock("@/hooks/use-admin-meta", () => ({
  useAdminMetaEvents: () => ({ data: { events: [event] } }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({
    formats: [{ slug: "standard", label: "Standard" }],
    labels: { standard: "Standard" },
  }),
}));

const stub = { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useAdminMetaCandidate: () => ({ data: captured.candidate }),
  useAcceptMetaCandidateEvent: () => ({ ...stub, mutateAsync: captured.acceptEvent }),
  useAcceptMetaCandidateEventWithDecks: () => ({ ...stub, mutateAsync: captured.acceptWithDecks }),
  useCheckMetaCandidateEvent: () => stub,
  useIgnoreMetaCandidateEvent: () => stub,
  useUnlinkMetaCandidateEvent: () => ({ ...stub, mutate: captured.unlinkEvent }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaCandidateDetailPage } from "./meta-candidate-detail-page";

function source(id: string, provider: string): MetaCandidateSource {
  return {
    id,
    provider,
    externalId: `${provider}-1`,
    name: "Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "standard",
    playerCount: 64,
    organizer: null,
    sourceUrl: null,
    notes: null,
    checkedAt: null,
    decks: [],
  };
}

function candidate(overrides: Partial<MetaCandidateDetailView> = {}): MetaCandidateDetailView {
  return {
    id: "cand-1",
    provider: "uvsgames",
    externalId: "uvs-1",
    name: "Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "standard",
    formatKnown: true,
    playerCount: 64,
    organizer: null,
    sourceUrl: null,
    notes: null,
    extraData: null,
    metaEventId: null,
    metaEventSlug: null,
    state: "new",
    diff: null,
    checkedAt: null,
    decks: [],
    sources: [],
    submittedDecks: [],
    ...overrides,
  };
}

describe("MetaCandidateDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.candidate = candidate();
  });

  it("keeps the single-source path a one-click accept", async () => {
    const user = userEvent.setup();
    captured.acceptWithDecks.mockResolvedValue({
      status: "accepted",
      event: {
        metaEventId: "event-1",
        slug: "s",
        created: true,
        acceptedDecks: [],
        skippedDecks: [],
      },
    });
    render(<MetaCandidateDetailPage candidateId="cand-1" />);

    await user.click(screen.getByRole("button", { name: "Accept event + ready decks" }));
    expect(captured.acceptWithDecks).toHaveBeenCalledWith({ id: "cand-1", overwriteAll: false });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("turns the multi-source refusal into a confirmation, not a failure toast", async () => {
    const user = userEvent.setup();
    captured.candidate = candidate({
      metaEventId: "event-1",
      metaEventSlug: "summoner-skirmish-2026",
      sources: [source("cand-1", "uvsgames"), source("cand-2", "playriftbound")],
    });
    captured.acceptWithDecks.mockResolvedValueOnce({
      status: "needsOverwriteConfirm",
      message: "This event also carries values from playriftbound.",
    });
    render(<MetaCandidateDetailPage candidateId="cand-1" />);

    await user.click(screen.getByRole("button", { name: "Take everything from uvsgames" }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("This event also carries values from playriftbound.");
    expect(captured.toastError).not.toHaveBeenCalled();
    expect(captured.toastSuccess).not.toHaveBeenCalled();
  });

  it("retries with the confirmation once the admin gives it", async () => {
    const user = userEvent.setup();
    captured.candidate = candidate({
      metaEventId: "event-1",
      sources: [source("cand-1", "uvsgames"), source("cand-2", "playriftbound")],
    });
    captured.acceptWithDecks
      .mockResolvedValueOnce({
        status: "needsOverwriteConfirm",
        message: "This event also carries values from playriftbound.",
      })
      .mockResolvedValueOnce({
        status: "accepted",
        event: {
          metaEventId: "event-1",
          slug: "s",
          created: false,
          acceptedDecks: [],
          skippedDecks: [],
        },
      });
    render(<MetaCandidateDetailPage candidateId="cand-1" />);

    await user.click(screen.getByRole("button", { name: "Take everything from uvsgames" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Overwrite" }));

    expect(captured.acceptWithDecks).toHaveBeenLastCalledWith({
      id: "cand-1",
      overwriteAll: true,
    });
    expect(dialog).not.toBeInTheDocument();
  });

  it("lets the admin back out to the per-field path", async () => {
    const user = userEvent.setup();
    captured.candidate = candidate({
      metaEventId: "event-1",
      sources: [source("cand-1", "uvsgames"), source("cand-2", "playriftbound")],
    });
    captured.acceptWithDecks.mockResolvedValue({
      status: "needsOverwriteConfirm",
      message: "This event also carries values from playriftbound.",
    });
    render(<MetaCandidateDetailPage candidateId="cand-1" />);

    await user.click(screen.getByRole("button", { name: "Take everything from uvsgames" }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Take fields one at a time" }));

    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(captured.acceptWithDecks).toHaveBeenCalledTimes(1);
  });

  it("shows the compare grid and roster only once a source is linked", () => {
    render(<MetaCandidateDetailPage candidateId="cand-1" />);
    expect(screen.queryByTestId("grid")).not.toBeInTheDocument();
    expect(screen.queryByTestId("roster")).not.toBeInTheDocument();

    captured.candidate = candidate({
      metaEventId: "event-1",
      sources: [source("cand-1", "uvsgames")],
    });
    render(<MetaCandidateDetailPage candidateId="cand-1" />);
    expect(screen.getByTestId("grid")).toBeInTheDocument();
    expect(screen.getByTestId("roster")).toBeInTheDocument();
  });
});
