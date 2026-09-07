import type { FriendGroupJoinPreviewResponse } from "@openrift/shared/types/api/friend-group";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface PreviewState {
  data?: FriendGroupJoinPreviewResponse;
  isError: boolean;
  isLoading: boolean;
}

let previewState: PreviewState;
let viewerId: string | undefined;

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => previewState,
}));

vi.mock("@/features/groups/hooks/use-friend-groups", () => ({
  friendGroupJoinPreviewQueryOptions: (code: string) => ({ code }),
  useJoinFriendGroupByCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/auth-session", () => ({
  useUserId: () => viewerId,
}));

vi.mock("@/features/account/components/signed-out-cta", () => ({
  SignedOutAuthButtons: ({ signInLabel }: { signInLabel?: string }) => (
    <a href="/login">{signInLabel}</a>
  ),
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
  Link: ({ to, children }: { to: string; children?: ReactNode }) => <a href={to}>{children}</a>,
}));

const { GroupsJoinPage } = await import("./groups-join-page");

function preview(
  overrides: Partial<FriendGroupJoinPreviewResponse> = {},
): FriendGroupJoinPreviewResponse {
  return {
    id: "group-1",
    slug: "tuesday-crew",
    name: "Tuesday Night Crew",
    description: null,
    memberCount: 4,
    viewerStatus: "available",
    ...overrides,
  };
}

describe("GroupsJoinPage", () => {
  beforeEach(() => {
    viewerId = "viewer-1";
    previewState = { data: undefined, isError: false, isLoading: false };
  });

  it("previews the group and offers to request a spot", () => {
    previewState = { data: preview(), isError: false, isLoading: false };
    render(<GroupsJoinPage code="abc123" />);

    expect(screen.getByText("Tuesday Night Crew")).toBeInTheDocument();
    expect(screen.getByText("4 members")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Request to join" })).toBeInTheDocument();
  });

  it("renders the description as markdown, linking off the allowlist", () => {
    previewState = {
      data: preview({ description: "**Tuesday** nights at [the shop](https://example.com)." }),
      isError: false,
      isLoading: false,
    };
    render(<GroupsJoinPage code="abc123" />);

    expect(screen.getByText("Tuesday").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "the shop" })).toHaveAttribute(
      "href",
      "https://example.com",
    );
    expect(screen.getByText("(example.com)")).toBeInTheDocument();
  });

  it("reports a dead link when the URL carries no code", () => {
    render(<GroupsJoinPage />);

    expect(screen.getByText("This invite link doesn't work")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request to join" })).not.toBeInTheDocument();
  });

  it("reports a dead link when the code no longer resolves", () => {
    previewState = { data: undefined, isError: true, isLoading: false };
    render(<GroupsJoinPage code="rotated-away" />);

    expect(screen.getByText("This invite link doesn't work")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request to join" })).not.toBeInTheDocument();
  });

  it("asks a signed-out visitor to sign in, after showing what they are joining", () => {
    viewerId = undefined;
    previewState = { data: preview(), isError: false, isLoading: false };
    render(<GroupsJoinPage code="abc123" />);

    expect(screen.getByText("Tuesday Night Crew")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in to request" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request to join" })).not.toBeInTheDocument();
  });

  it("shows an outstanding request instead of a second one", () => {
    previewState = { data: preview({ viewerStatus: "pending" }), isError: false, isLoading: false };
    render(<GroupsJoinPage code="abc123" />);

    expect(screen.getByRole("button", { name: "Already requested" })).toBeInTheDocument();
  });

  it("sends an existing member to the group instead of asking again", () => {
    previewState = { data: preview({ viewerStatus: "member" }), isError: false, isLoading: false };
    render(<GroupsJoinPage code="abc123" />);

    expect(screen.getByRole("button", { name: "Open group" })).toBeInTheDocument();
  });
});
