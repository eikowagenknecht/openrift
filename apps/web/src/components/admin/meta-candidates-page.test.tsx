import type { MetaCandidateQueueRow } from "@openrift/shared";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({
  candidates: [] as unknown[],
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useNavigate: () => vi.fn(),
  createLink: (component: unknown) => component,
}));

vi.mock("@/components/admin/admin-page-top-bar", () => ({
  AdminPageTopBar: ({ actions }: { actions?: ReactNode }) => <div>{actions}</div>,
}));

vi.mock("@/hooks/use-admin-meta-candidates", () => ({
  useAdminMetaCandidates: () => ({ data: { candidates: captured.candidates } }),
  useCheckMetaCandidateEvent: () => ({ mutate: vi.fn(), isPending: false }),
  useIgnoreMetaCandidateEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRematchMetaCandidates: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useDeckFormatList: () => ({ formats: [], labels: { standard: "Standard" } }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { MetaCandidatesPage } from "./meta-candidates-page";

function candidate(overrides: Partial<MetaCandidateQueueRow> = {}): MetaCandidateQueueRow {
  return {
    id: "candidate-1",
    provider: "uvsgames",
    externalId: "evt-1",
    name: "Summoner Skirmish",
    eventDate: "2026-08-15",
    format: "standard",
    playerRowCount: 8,
    unacceptedPlayerCount: 8,
    state: "new",
    unresolvedCardCount: 0,
    linkedSourceCount: 1,
    checkedAt: null,
    metaEventId: null,
    metaEventSlug: null,
    ...overrides,
  };
}

describe("MetaCandidatesPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    captured.candidates = [candidate()];
  });

  it("flags a row several sources feed into the same live event", () => {
    captured.candidates = [candidate({ linkedSourceCount: 3 })];
    render(<MetaCandidatesPage />);
    expect(screen.getByText("3 sources")).toBeInTheDocument();
  });

  it("leaves the chip off a candidate that is the only source", () => {
    render(<MetaCandidatesPage />);
    expect(screen.queryByText(/sources/u)).not.toBeInTheDocument();
  });

  it("names a player's own submission rather than printing its provider slug", () => {
    captured.candidates = [candidate({ provider: "usersubmission" })];
    render(<MetaCandidatesPage />);
    expect(screen.getByText("User submission")).toBeInTheDocument();
    expect(screen.queryByText("usersubmission")).not.toBeInTheDocument();
  });

  it("keeps the unmatched-card count beside the state", () => {
    captured.candidates = [candidate({ unresolvedCardCount: 4 })];
    render(<MetaCandidatesPage />);
    expect(screen.getByText("4 unmatched")).toBeInTheDocument();
  });
});
