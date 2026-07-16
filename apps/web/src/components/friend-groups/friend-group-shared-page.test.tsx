import type {
  CollectionResponse,
  FriendGroupCollectionShareResponse,
  FriendGroupDetailResponse,
  FriendGroupMemberResponse,
} from "@openrift/shared";
import { render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

// Mutated per test before rendering; read lazily inside the mock factories.
let currentCollections: CollectionResponse[] = [];

vi.mock("@/hooks/use-cards", () => ({
  useCards: () => ({ cardsById: {}, printingsById: {} }),
}));

vi.mock("@/hooks/use-collections", () => ({
  useCollections: () => ({ data: currentCollections }),
}));

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroupDetail: () => ({ data: undefined }),
  useFriendGroupShareableCollections: () => ({ data: { items: [] } }),
}));

vi.mock("@/lib/auth-session", () => ({
  useRequiredUserId: () => "viewer-1",
}));

vi.mock("@/lib/copies-collection", () => ({
  useCopiesCollection: () => null,
}));

vi.mock("@tanstack/react-db", () => ({
  useLiveQuery: () => ({ data: undefined }),
}));

vi.mock("@/components/collection/create-collection-dialog", () => ({
  CreateCollectionDialog: () => null,
}));

vi.mock("./share-collections-with-group-dialog", () => ({
  ShareCollectionsWithGroupDialog: () => null,
}));

vi.mock("@tanstack/react-router", () => ({
  createLink: (component: unknown) => component,
  useNavigate: () => vi.fn(),
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children?: ReactNode;
    className?: string;
  }) => {
    let path = to;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        path = path.replace(`$${key}`, value);
      }
    }
    return (
      <a href={path} className={className}>
        {children}
      </a>
    );
  },
}));

const { SharedPageContent } = await import("./friend-group-shared-page");

function makeMember(
  userId: string,
  userName: string,
  overrides: Partial<FriendGroupMemberResponse> = {},
): FriendGroupMemberResponse {
  return {
    userId,
    userName,
    userImage: null,
    gravatarHash: "0".repeat(64),
    role: "member",
    contactMethods: [],
    joinedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeCollectionShare(
  collectionId: string,
  userId: string,
  overrides: Partial<FriendGroupCollectionShareResponse> = {},
): FriendGroupCollectionShareResponse {
  return {
    groupId: "group-1",
    collectionId,
    collectionName: `Collection ${collectionId}`,
    userId,
    userName: null,
    sharedAt: "2026-01-02T00:00:00Z",
    copyCount: 5,
    coverPrintings: [],
    ...overrides,
  };
}

function makeGroupCollection(id: string, name: string, copyCount: number): CollectionResponse {
  return {
    id,
    name,
    description: null,
    isInbox: false,
    sortOrder: 0,
    groupId: "group-1",
    copyCount,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  } as CollectionResponse;
}

function makeDetail(overrides: Partial<FriendGroupDetailResponse> = {}): FriendGroupDetailResponse {
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
    members: [makeMember("viewer-1", "Viewer")],
    shares: [],
    collectionShares: [],
    pendingRequests: [],
    cardsTradedCount: 0,
    cardsTradedByMember: {},
    ...overrides,
  };
}

function renderPage(overrides: Partial<FriendGroupDetailResponse> = {}) {
  currentCollections = [];
  return render(<SharedPageContent slug="bothfeld" data={makeDetail(overrides)} />);
}

describe("SharedPageContent group collections", () => {
  it("renders pooled collections as tiles linking to the collection page", () => {
    currentCollections = [makeGroupCollection("col-1", "Game Night Pool", 42)];
    render(<SharedPageContent slug="bothfeld" data={makeDetail()} />);
    const tile = screen.getByRole("link", { name: /Game Night Pool/u });
    expect(tile).toHaveAttribute("href", "/collections/col-1");
    expect(tile).toHaveTextContent("42 copies");
  });

  it("always offers the dashed create tile, even with no collections yet", () => {
    renderPage();
    const create = screen.getByRole("button", { name: /New shared collection/u });
    expect(create).toHaveTextContent("pooled inventory");
  });
});

describe("SharedPageContent member shares", () => {
  it("keeps the viewer's block visible with nothing shared yet", () => {
    renderPage();
    expect(screen.getByText("Viewer")).toBeInTheDocument();
    expect(screen.getByText("nothing shared yet")).toBeInTheDocument();
  });

  it("drops other members with nothing shared and lists shares under their owner", () => {
    renderPage({
      members: [
        makeMember("viewer-1", "Viewer"),
        makeMember("user-2", "Mira"),
        makeMember("user-3", "Jonas"),
      ],
      collectionShares: [
        makeCollectionShare("col-9", "user-2", { collectionName: "Trade Binder", copyCount: 1 }),
      ],
    });
    expect(screen.getByText("Mira")).toBeInTheDocument();
    expect(screen.queryByText("Jonas")).not.toBeInTheDocument();
    const row = screen.getByRole("link", { name: /Trade Binder/u });
    expect(row).toHaveAttribute("href", "/groups/bothfeld/collections/col-9");
    expect(row).toHaveTextContent("1 copy");
  });

  it("shows cover art thumbs when the share carries cover printings", () => {
    renderPage({
      members: [makeMember("viewer-1", "Viewer"), makeMember("user-2", "Mira")],
      collectionShares: [
        makeCollectionShare("col-9", "user-2", {
          coverPrintings: [
            { printingId: "p-1", imageId: "img-1" },
            { printingId: "p-2", imageId: "img-2" },
          ],
        }),
      ],
    });
    const row = screen.getByRole("link", { name: /Collection col-9/u });
    expect(within(row).getAllByRole("presentation")).toHaveLength(2);
  });
});
