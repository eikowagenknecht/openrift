import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateMutateAsync = vi.fn();

vi.mock("@/hooks/use-friend-groups", () => ({
  useCreateFriendGroupDiscordLinkCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteFriendGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteFriendGroupDiscordLink: () => ({ mutate: vi.fn(), isPending: false }),
  useDisableFriendGroupCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useEnableFriendGroupCode: () => ({ mutate: vi.fn(), isPending: false }),
  useFriendGroupDetail: () => ({ data: undefined }),
  useFriendGroupDiscordLinks: () => ({ data: { items: [] } }),
  useFriendGroupShareableCollections: () => ({ data: { items: [] } }),
  useFriendGroupShareableLists: () => ({ data: { items: [] } }),
  useLeaveFriendGroup: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRotateFriendGroupCode: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useShareCollectionWithFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useShareListWithFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useTransferFriendGroupOwnership: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUnshareCollectionFromFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useUnshareListFromFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFriendGroup: () => ({ mutateAsync: updateMutateAsync, isPending: false }),
  useUpdateGroupContactReveal: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/lib/auth-session", () => ({ useRequiredUserId: () => "viewer-1" }));
vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
  Link: ({ children }: { children?: React.ReactNode }) => <a href="/">{children}</a>,
}));

const { AdminSettings } = await import("./friend-group-manage-page");

function makeDetail(
  group: Partial<FriendGroupDetailResponse["group"]> = {},
): FriendGroupDetailResponse {
  return {
    group: {
      id: "group-1",
      slug: "bothfeld",
      name: "Bothfeld Connection",
      description: null,
      code: null,
      codeRotatedAt: "2026-01-01T00:00:00Z",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z",
      ...group,
    },
    viewerStatus: "member",
    viewerRole: "owner",
    members: [],
    shares: [],
    collectionShares: [],
    pendingRequests: [],
    cardsTradedCount: 0,
    cardsTradedByMember: {},
  };
}

beforeEach(() => {
  updateMutateAsync.mockReset();
  updateMutateAsync.mockResolvedValue({ slug: "bothfeld" });
});

describe("AdminSettings group form", () => {
  it("saves a valid edit", async () => {
    const user = userEvent.setup();
    render(<AdminSettings data={makeDetail()} slug="bothfeld" />);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Bothfeld Crew");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(updateMutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "bothfeld", name: "Bothfeld Crew" }),
    );
  });

  it("blocks a slug the server would reject instead of sending it", async () => {
    const user = userEvent.setup();
    render(<AdminSettings data={makeDetail()} slug="bothfeld" />);

    await user.clear(screen.getByLabelText("Slug"));
    await user.type(screen.getByLabelText("Slug"), "-nope");

    expect(
      screen.getByText("Lowercase letters, digits, and dashes, starting with a letter or digit"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("blocks a slug shorter than the server minimum", async () => {
    const user = userEvent.setup();
    render(<AdminSettings data={makeDetail()} slug="bothfeld" />);

    await user.clear(screen.getByLabelText("Slug"));
    await user.type(screen.getByLabelText("Slug"), "ab");

    expect(screen.getByText("Use at least 3 characters")).toBeInTheDocument();
    expect(updateMutateAsync).not.toHaveBeenCalled();
  });

  it("blocks an empty slug", async () => {
    const user = userEvent.setup();
    render(<AdminSettings data={makeDetail()} slug="bothfeld" />);

    await user.clear(screen.getByLabelText("Slug"));

    expect(screen.getByText("Pick a web address")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("blocks an empty name", async () => {
    const user = userEvent.setup();
    render(<AdminSettings data={makeDetail()} slug="bothfeld" />);

    await user.clear(screen.getByLabelText("Name"));

    expect(screen.getByText("Give the group a name")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("swallows a rejected save so it never becomes an unhandled rejection", async () => {
    const user = userEvent.setup();
    updateMutateAsync.mockRejectedValue(new Error("Input validation failed"));
    render(<AdminSettings data={makeDetail()} slug="bothfeld" />);

    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Bothfeld Crew");

    await expect(
      user.click(screen.getByRole("button", { name: "Save changes" })),
    ).resolves.toBeUndefined();
  });
});
