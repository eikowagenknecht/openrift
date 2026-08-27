import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const shareMutate = vi.fn();
const unshareMutate = vi.fn();

vi.mock("@/hooks/use-collections", () => ({
  useShareCollection: () => ({ mutate: shareMutate, isPending: false }),
  useUnshareCollection: () => ({ mutate: unshareMutate, isPending: false }),
}));

// Friend-group sharing is exercised at the route level; here we just stub the
// hooks so the dialog renders without a QueryClientProvider. The default empty
// groups list short-circuits the "Share with friend groups" section; tests that
// need the section rendered override `groupsMock`.
const { groupsMock, groupSharesMock } = vi.hoisted(() => ({
  groupsMock: vi.fn(
    (): {
      data: {
        items: { id: string; slug: string; name: string }[];
        outgoingRequests: unknown[];
      };
    } => ({ data: { items: [], outgoingRequests: [] } }),
  ),
  groupSharesMock: vi.fn((): { data: { items: { groupId: string }[] } } => ({
    data: { items: [] },
  })),
}));

vi.mock("@/hooks/use-friend-groups", () => ({
  useFriendGroups: groupsMock,
  useShareCollectionWithFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
  useUnshareCollectionFromFriendGroup: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-collection-group-shares", () => ({
  useCollectionGroupShares: groupSharesMock,
}));

vi.mock("@/lib/site-config", () => ({
  getSiteUrl: () => "https://openrift.test",
}));

const { CollectionShareDialog } = await import("./collection-share-dialog");

function Harness({
  isPublic,
  shareToken,
  isGroupCollection = false,
}: {
  isPublic: boolean;
  shareToken: string | null;
  isGroupCollection?: boolean;
}) {
  const [open, setOpen] = useState(true);
  return (
    <CollectionShareDialog
      collectionId="abc"
      collectionName="Main binder"
      isPublic={isPublic}
      shareToken={shareToken}
      isGroupCollection={isGroupCollection}
      open={open}
      onOpenChange={setOpen}
    />
  );
}

describe("CollectionShareDialog", () => {
  afterEach(() => {
    // mockReset (not mockClear) so the throwing implementation below doesn't
    // leak, and so call counts start empty for the assertions that check the
    // panel's query never ran.
    groupsMock.mockReset();
    groupsMock.mockReturnValue({ data: { items: [], outgoingRequests: [] } });
    groupSharesMock.mockReset();
    groupSharesMock.mockReturnValue({ data: { items: [] } });
    vi.restoreAllMocks();
  });

  it("renders 'Create link' when the collection is not yet shared", () => {
    render(<Harness isPublic={false} shareToken={null} />);
    expect(screen.getByRole("button", { name: /create link/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /stop sharing/iu })).not.toBeInTheDocument();
  });

  it("triggers useShareCollection when 'Create link' is clicked", async () => {
    const user = userEvent.setup();
    shareMutate.mockClear();
    render(<Harness isPublic={false} shareToken={null} />);
    await user.click(screen.getByRole("button", { name: /create link/iu }));
    expect(shareMutate).toHaveBeenCalledWith("abc");
  });

  it("renders the share URL and a Stop sharing button when public", () => {
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    const input = screen.getByDisplayValue("https://openrift.test/collections/share/AbCdEfGhIjKl");
    expect(input).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop sharing/iu })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /create link/iu })).not.toBeInTheDocument();
  });

  it("triggers useUnshareCollection when 'Stop sharing' is clicked", async () => {
    const user = userEvent.setup();
    unshareMutate.mockClear();
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /stop sharing/iu }));
    expect(unshareMutate).toHaveBeenCalledWith("abc");
  });

  it("flips the Copy button label to 'Copied' after clicking", async () => {
    const user = userEvent.setup();
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("button", { name: /copy/iu }));
    expect(screen.getByRole("button", { name: /copied/iu })).toBeInTheDocument();
  });

  it("renders the friend-group panel for a personal collection", () => {
    groupsMock.mockReturnValue({
      data: {
        items: [{ id: "group-1", slug: "allerlei", name: "Allerlei Spielerei" }],
        outgoingRequests: [],
      },
    });
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    expect(screen.getByText("Share with friend groups")).toBeInTheDocument();
  });

  // Regression: the panel shares a *personal* binder with a
  // group, and its `groupShares` query 404s on a pooled collection by design.
  // Rendering it for a group collection threw out of the suspense query and
  // killed the whole route.
  it("omits the friend-group panel for a group collection", () => {
    groupsMock.mockReturnValue({
      data: {
        items: [{ id: "group-1", slug: "allerlei", name: "Allerlei Spielerei" }],
        outgoingRequests: [],
      },
    });
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" isGroupCollection />);
    expect(screen.queryByText("Share with friend groups")).not.toBeInTheDocument();
    expect(groupSharesMock).not.toHaveBeenCalled();
  });

  it("previews the collection's own image render, QR included, once shared", async () => {
    const user = userEvent.setup();
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    await user.click(screen.getByRole("tab", { name: "Image" }));

    const preview = await screen.findByRole("img", { name: "Preview of Main binder" });
    expect(preview).toHaveAttribute(
      "src",
      "https://openrift.test/api/v1/collections/abc/image.png",
    );
    expect(screen.getByRole("switch", { name: /qr code/iu })).toBeEnabled();
  });

  // The owner route renders an unshared collection too, so the image stays
  // downloadable — only the QR needs a link to point at.
  it("offers the image without a QR before the collection is shared", async () => {
    const user = userEvent.setup();
    render(<Harness isPublic={false} shareToken={null} />);
    await user.click(screen.getByRole("tab", { name: "Image" }));

    const preview = await screen.findByRole("img", { name: "Preview of Main binder" });
    expect(preview).toHaveAttribute(
      "src",
      "https://openrift.test/api/v1/collections/abc/image.png?qr=0",
    );
    // BaseUI's switch is a span, so it marks the disabled state with the ARIA
    // attribute rather than the native `disabled` property.
    expect(screen.getByRole("switch", { name: /qr code/iu })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("keeps the share link usable when the friend-group panel throws", () => {
    // The render error is expected; keep it out of the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    groupsMock.mockReturnValue({
      data: {
        items: [{ id: "group-1", slug: "allerlei", name: "Allerlei Spielerei" }],
        outgoingRequests: [],
      },
    });
    groupSharesMock.mockImplementation(() => {
      throw new Error("Collection not found");
    });
    render(<Harness isPublic shareToken="AbCdEfGhIjKl" />);
    expect(
      screen.getByDisplayValue("https://openrift.test/collections/share/AbCdEfGhIjKl"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Share with friend groups")).not.toBeInTheDocument();
  });
});
