import type { TournamentDetailResponse, TournamentStaffMemberResponse } from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const removeStaffMutateAsync = vi.fn();
const setInviteMutateAsync = vi.fn();

vi.mock("@/hooks/use-tournaments", () => ({
  useAddTournamentStaff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRemoveTournamentStaff: () => ({ mutateAsync: removeStaffMutateAsync, isPending: false }),
  useSetTournamentStaffInvite: () => ({ mutateAsync: setInviteMutateAsync, isPending: false }),
  useTournamentStaffCandidates: () => ({ data: { items: [] }, isLoading: false }),
}));

// The invite URL must come from the env-backed origin, never a hardcoded site
// URL — pinning it here also keeps the copied-text assertion deterministic.
vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://preview.example.test",
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

const { TournamentStaffTab } = await import("./tournament-staff-tab");

function makeStaff(
  userId: string,
  role: TournamentStaffMemberResponse["role"],
  overrides: Partial<TournamentStaffMemberResponse> = {},
): TournamentStaffMemberResponse {
  return {
    userId,
    name: `Player ${userId}`,
    role,
    source: "grant",
    orgRole: null,
    addedAt: "2026-03-01T12:00:00Z",
    ...overrides,
  };
}

function makeDetail(overrides: Partial<TournamentDetailResponse> = {}): TournamentDetailResponse {
  return {
    id: "tournament-1",
    name: "Summoner Skirmish",
    host: {
      type: "user",
      userId: "user-1",
      orgId: null,
      displayName: "Hextech Hall",
      orgSlug: null,
    },
    myRoles: ["host"],
    staff: [],
    organizerInviteToken: null,
    judgeInviteToken: null,
    ...overrides,
  } as unknown as TournamentDetailResponse;
}

describe("TournamentStaffTab roster", () => {
  it("groups staff by role with counts instead of one flat list", () => {
    render(
      <TournamentStaffTab
        detail={makeDetail({
          staff: [
            makeStaff("u1", "organizer"),
            makeStaff("u2", "judge"),
            makeStaff("u3", "organizer"),
          ],
        })}
      />,
    );

    const organizers = screen.getByRole("heading", { name: /Organizers/u });
    const judges = screen.getByRole("heading", { name: /Judges/u });
    expect(within(organizers).getByText("2")).toBeInTheDocument();
    expect(within(judges).getByText("1")).toBeInTheDocument();
  });

  // The whole point of grouping: an event with no judge should say so rather
  // than silently omitting the group.
  it("says so when a role group is empty", () => {
    render(<TournamentStaffTab detail={makeDetail({ staff: [makeStaff("u1", "organizer")] })} />);

    expect(screen.getByText(/No judges yet/u)).toBeInTheDocument();
    expect(screen.queryByText(/No organizers yet/u)).not.toBeInTheDocument();
  });

  it("marks org-derived staff and keeps the org name reachable", () => {
    render(
      <TournamentStaffTab
        detail={makeDetail({
          staff: [makeStaff("u1", "organizer", { source: "organization", orgRole: "owner" })],
        })}
      />,
    );

    expect(screen.getByTitle("Owner of Hextech Hall")).toHaveTextContent("via org");
  });
});

describe("TournamentStaffTab remove action", () => {
  beforeEach(() => {
    removeStaffMutateAsync.mockClear();
  });

  it("offers Remove only for grant-sourced staff", async () => {
    const user = userEvent.setup();
    render(
      <TournamentStaffTab
        detail={makeDetail({
          staff: [
            makeStaff("u1", "organizer", { source: "organization", orgRole: "manager" }),
            makeStaff("u2", "judge"),
          ],
        })}
      />,
    );

    // Only the grant-sourced judge gets a kebab; the org-derived organizer has
    // no menu at all.
    const menus = screen.getAllByRole("button", { name: "Staff actions" });
    expect(menus).toHaveLength(1);

    await user.click(menus[0]);
    await user.click(await screen.findByRole("menuitem", { name: /Remove/u }));
    expect(removeStaffMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      userId: "u2",
      role: "judge",
    });
  });

  it("shows no staff menus to a non-host", () => {
    render(
      <TournamentStaffTab
        detail={makeDetail({ myRoles: ["judge"], staff: [makeStaff("u2", "judge")] })}
      />,
    );

    expect(screen.queryByRole("button", { name: "Staff actions" })).not.toBeInTheDocument();
  });
});

describe("TournamentStaffTab invite band", () => {
  beforeEach(() => {
    setInviteMutateAsync.mockClear();
  });

  it("renders a create row for a missing link", async () => {
    const user = userEvent.setup();
    render(<TournamentStaffTab detail={makeDetail()} />);

    expect(screen.getByText("Invite links")).toBeInTheDocument();
    expect(screen.getAllByText("No link yet")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Create link for judge" }));
    expect(setInviteMutateAsync).toHaveBeenCalledWith({
      id: "tournament-1",
      role: "judge",
      enabled: true,
    });
  });

  it("renders a share row and disable for a live link, and counts the active ones", () => {
    render(<TournamentStaffTab detail={makeDetail({ judgeInviteToken: "tok-judge" })} />);

    // One of the two links is live.
    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByLabelText("Judge invite link")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Disable judge invite link" })).toBeInTheDocument();
    // The organizer row keeps the same shape, still offering a create action.
    expect(screen.getByRole("button", { name: "Create link for organizer" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Organizer invite link")).toBeNull();
  });

  it("shows the full absolute URL and copies it", async () => {
    const user = userEvent.setup();
    // After setup(): userEvent installs its own clipboard stub, which would
    // otherwise replace this spy.
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    render(<TournamentStaffTab detail={makeDetail({ judgeInviteToken: "tok-judge" })} />);

    const fullUrl = "https://preview.example.test/tournaments/staff-invite/tok-judge";
    expect(screen.getByLabelText("Judge invite link")).toHaveValue(fullUrl);

    await user.click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledWith(fullUrl);
  });

  it("hides the invite band from a non-host", () => {
    render(<TournamentStaffTab detail={makeDetail({ myRoles: ["judge"] })} />);

    expect(screen.queryByText("Invite links")).not.toBeInTheDocument();
  });
});
