import type { FriendGroupDetailResponse } from "@openrift/shared/types/api/friend-group";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "viewer-1",
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  Link: ({
    to,
    params,
    hash,
    children,
  }: {
    to: string;
    params?: Record<string, string>;
    hash?: string;
    children?: ReactNode;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return <a href={hash ? `${path}#${hash}` : path}>{children}</a>;
  },
}));

const { GroupSetupNudges, pendingGroupNudges } = await import("./group-setup-nudges");
const { useOnboardingStore } = await import("@/features/account/stores/onboarding-store");

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useOnboardingStore);
});

afterEach(() => {
  resetStore();
});

function makeDetail(
  overrides: Partial<Pick<FriendGroupDetailResponse, "members" | "shares">> = {},
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
    },
    viewerStatus: "member",
    viewerRole: "member",
    members: [makeMember()],
    shares: [],
    collectionShares: [],
    pendingRequests: [],
    cardsTradedCount: 0,
    cardsTradedByMember: {},
    ...overrides,
  };
}

function makeMember(
  overrides: Partial<FriendGroupDetailResponse["members"][number]> = {},
): FriendGroupDetailResponse["members"][number] {
  return {
    userId: "viewer-1",
    userName: "Viewer",
    userImage: null,
    gravatarHash: "hash",
    role: "member",
    joinedAt: "2026-01-01T00:00:00Z",
    contactMethods: [],
    ...overrides,
  };
}

function makeShare(
  overrides: Partial<FriendGroupDetailResponse["shares"][number]> = {},
): FriendGroupDetailResponse["shares"][number] {
  return {
    groupId: "group-1",
    listId: "list-1",
    listName: "Wants",
    listIntent: "wish",
    listKind: "card",
    userId: "viewer-1",
    userName: "Viewer",
    entryCount: 3,
    sharedAt: "2026-01-02T00:00:00Z",
    ...overrides,
  };
}

function contactMethod(): FriendGroupDetailResponse["members"][number]["contactMethods"][number] {
  return { id: "cm-1", type: "discord", value: "viewer#0001" };
}

describe("pendingGroupNudges", () => {
  it("flags both gaps for a member with no contacts and no shares", () => {
    expect(pendingGroupNudges(makeDetail(), "viewer-1")).toEqual(["contacts", "lists"]);
  });

  it("drops the contacts nudge once a method is revealed to the group", () => {
    const data = makeDetail({ members: [makeMember({ contactMethods: [contactMethod()] })] });
    expect(pendingGroupNudges(data, "viewer-1")).toEqual(["lists"]);
  });

  it("drops the lists nudge once the viewer shares a list", () => {
    const data = makeDetail({ shares: [makeShare()] });
    expect(pendingGroupNudges(data, "viewer-1")).toEqual(["contacts"]);
  });

  it("ignores shares owned by other members", () => {
    const data = makeDetail({ shares: [makeShare({ userId: "other-1" })] });
    expect(pendingGroupNudges(data, "viewer-1")).toContain("lists");
  });

  it("returns nothing when both are set up", () => {
    const data = makeDetail({
      members: [makeMember({ contactMethods: [contactMethod()] })],
      shares: [makeShare()],
    });
    expect(pendingGroupNudges(data, "viewer-1")).toEqual([]);
  });

  it("returns nothing when the viewer has no membership row", () => {
    expect(pendingGroupNudges(makeDetail({ members: [] }), "viewer-1")).toEqual([]);
  });
});

describe("GroupSetupNudges", () => {
  it("links each nudge to the group's manage page and the help article", () => {
    render(<GroupSetupNudges slug="bothfeld" data={makeDetail()} />);
    expect(screen.getByRole("link", { name: "Choose your contacts" })).toHaveAttribute(
      "href",
      "/groups/bothfeld/manage#contacts",
    );
    expect(screen.getByRole("link", { name: "Share your lists" })).toHaveAttribute(
      "href",
      "/groups/bothfeld/manage#lists",
    );
    expect(screen.getAllByRole("link", { name: /^How .+ works?$/u })).toHaveLength(2);
  });

  it("hides a nudge after it is dismissed and keeps the other one", async () => {
    const user = userEvent.setup();
    render(<GroupSetupNudges slug="bothfeld" data={makeDetail()} />);
    await user.click(screen.getByRole("button", { name: /Members can't reach you/u }));
    expect(screen.queryByText("Members can't reach you")).not.toBeInTheDocument();
    expect(screen.getByText("This group can't see any of your lists")).toBeInTheDocument();
  });

  it("keeps a dismissal scoped to the group it was made in", () => {
    useOnboardingStore.getState().dismissGroupNudge("bothfeld", "contacts");
    render(<GroupSetupNudges slug="cube-night" data={makeDetail()} />);
    expect(screen.getByText("Members can't reach you")).toBeInTheDocument();
  });

  it("renders nothing when there is nothing to nudge about", () => {
    const data = makeDetail({
      members: [makeMember({ contactMethods: [contactMethod()] })],
      shares: [makeShare()],
    });
    const { container } = render(<GroupSetupNudges slug="bothfeld" data={data} />);
    expect(container).toBeEmptyDOMElement();
  });
});
