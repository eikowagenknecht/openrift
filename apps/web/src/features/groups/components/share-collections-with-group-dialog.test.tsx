import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

interface MockCollectionItem {
  collectionId: string;
  collectionName: string;
  sharedAt: string | null;
}

// Mutated per test before rendering; read lazily inside the mock factory.
let currentItems: MockCollectionItem[] = [];

const shareMutateAsync = vi.fn().mockResolvedValue(undefined);

vi.mock("@/features/groups/hooks/use-friend-group-sharing", () => ({
  useFriendGroupShareableCollections: () => ({ data: { items: currentItems } }),
  useShareCollectionWithFriendGroup: () => ({ mutateAsync: shareMutateAsync, isPending: false }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/" className={className}>
      {children}
    </a>
  ),
}));

const { ShareCollectionsWithGroupDialog } = await import("./share-collections-with-group-dialog");

const onOpenChange = vi.fn();

function renderDialog() {
  return render(
    <ShareCollectionsWithGroupDialog
      slug="bothfeld"
      groupName="Bothfeld Connection"
      open
      onOpenChange={onOpenChange}
    />,
  );
}

const BINDER: MockCollectionItem = {
  collectionId: "c1",
  collectionName: "Main Binder",
  sharedAt: null,
};
const SPARES: MockCollectionItem = {
  collectionId: "c2",
  collectionName: "Spares Box",
  sharedAt: null,
};

describe("ShareCollectionsWithGroupDialog", () => {
  beforeEach(() => {
    currentItems = [BINDER, SPARES];
    shareMutateAsync.mockClear();
    onOpenChange.mockClear();
  });

  it("starts with nothing pre-selected, so the confirm button is disabled", () => {
    renderDialog();
    expect(screen.getByRole("checkbox", { name: /Main Binder/u })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Spares Box/u })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /^Share/u })).toBeDisabled();
  });

  it("shares the collections the user picks on confirm and closes", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("checkbox", { name: /Main Binder/u }));
    await user.click(screen.getByRole("checkbox", { name: /Spares Box/u }));
    await user.click(screen.getByRole("button", { name: "Share 2 collections" }));

    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(2));
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "bothfeld", collectionId: "c1" });
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "bothfeld", collectionId: "c2" });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("shares only the collection the user checked", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("checkbox", { name: /Main Binder/u }));
    await user.click(screen.getByRole("button", { name: "Share 1 collection" }));

    await waitFor(() => expect(shareMutateAsync).toHaveBeenCalledTimes(1));
    expect(shareMutateAsync).toHaveBeenCalledWith({ slug: "bothfeld", collectionId: "c1" });
  });

  it("excludes collections already shared", () => {
    currentItems = [BINDER, { ...SPARES, sharedAt: "2026-06-16T00:00:00Z" }];
    renderDialog();

    expect(screen.getByRole("checkbox", { name: /Main Binder/u })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /Spares Box/u })).not.toBeInTheDocument();
  });

  it("offers a create-a-collection message when none exist", () => {
    currentItems = [];
    renderDialog();

    expect(screen.getByText(/don't have a collection to share yet/iu)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Share/u })).not.toBeInTheDocument();
  });

  it("says everything is already shared when no collection is left to share", () => {
    currentItems = [{ ...BINDER, sharedAt: "2026-06-16T00:00:00Z" }];
    renderDialog();

    expect(screen.getByText(/already shared all your collections/iu)).toBeInTheDocument();
    expect(screen.queryByText(/don't have a collection to share yet/iu)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Share/u })).not.toBeInTheDocument();
  });
});
