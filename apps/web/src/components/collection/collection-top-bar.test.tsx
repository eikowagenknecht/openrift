import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

// Keep the props the bar puts on its links (aria-label, className) so the
// rendered anchors still carry their accessible names.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    params: _params,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to?: string; params?: unknown }) => (
    <a href="#link" {...rest}>
      {children}
    </a>
  ),
  createLink: (component: unknown) => component,
}));

// Select mode has its own tests; here it would only add buttons to look past.
vi.mock("@/components/cards/select-mode-actions", () => ({
  SelectModeActions: () => null,
}));

const { CollectionTopBar } = await import("./collection-top-bar");

// Renders the bar for a collection the viewer administers, so the ⋮ menu is
// present in every case and only the placement of the add actions varies.
function renderTopBar(overrides: {
  addActionsInBar: boolean;
  hasCards?: boolean;
  showAddActions?: boolean;
  homeDecks?: { id: string; name: string }[];
  canShare?: boolean;
  mode?: "browse" | "select";
  shareUrl?: string;
  collectionName?: string;
  onShare?: () => void;
}) {
  render(
    <CollectionTopBar
      title="Binder"
      homeDecks={[]}
      onToggleSidebar={() => {}}
      mode="browse"
      valueCents={1234}
      unpricedCount={0}
      formatValue={(value) => `${value} €`}
      addTarget="collection-1"
      showAddActions
      onQuickAdd={() => {}}
      onSelectAll={() => {}}
      onEnterSelect={() => {}}
      onExitSelect={() => {}}
      hasCards
      isAllSelected={false}
      view="cards"
      canEdit
      canDelete
      canClearInbox={false}
      canShare
      canToggleDeckbuilding
      deckbuildingAvailable
      onEdit={() => {}}
      onDelete={() => {}}
      onClearInbox={() => {}}
      onShare={() => {}}
      onToggleDeckbuilding={() => {}}
      {...overrides}
    />,
  );
}

describe("CollectionTopBar", () => {
  // Both breakpoint variants of each action are in the DOM; CSS picks one.
  it("keeps Scan and Quick add in the bar where adding is the point", () => {
    renderTopBar({ addActionsInBar: true });

    expect(screen.getAllByRole("button", { name: /scan/iu }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Quick add" }).length).toBeGreaterThan(0);
  });

  it("folds them into the actions menu on a single collection", async () => {
    const user = userEvent.setup();
    renderTopBar({ addActionsInBar: false });

    expect(screen.queryByRole("button", { name: /scan/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick add" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collection actions" }));

    expect(await screen.findByRole("menuitem", { name: "Scan cards" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Quick add" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("still offers both actions on a collection holding no cards", () => {
    renderTopBar({ addActionsInBar: true, hasCards: false });

    expect(screen.getAllByRole("button", { name: /scan/iu }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Quick add" }).length).toBeGreaterThan(0);
  });

  it("drops both while the empty state carries its own", () => {
    renderTopBar({ addActionsInBar: true, showAddActions: false });

    expect(screen.queryByRole("button", { name: /scan/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick add" })).not.toBeInTheDocument();
  });

  it("puts Share in the bar on a named collection, and keeps the menu entry", async () => {
    const user = userEvent.setup();
    renderTopBar({ addActionsInBar: false });

    expect(screen.getByRole("button", { name: "Share" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collection actions" }));
    expect(await screen.findByRole("menuitem", { name: "Share" })).toBeInTheDocument();
  });

  it("leaves Share menu-only where the bar carries the add actions", () => {
    renderTopBar({ addActionsInBar: true });

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("withholds the binder sheet until the collection has a share link", async () => {
    const user = userEvent.setup();
    renderTopBar({ addActionsInBar: false });

    await user.click(screen.getByRole("button", { name: "Collection actions" }));
    expect(await screen.findByRole("menuitem", { name: "Share" })).toBeInTheDocument();
    expect(
      screen.queryByRole("menuitem", { name: /print binder sheet/iu }),
    ).not.toBeInTheDocument();
  });

  it("opens the binder sheet dialog from the actions menu", async () => {
    const user = userEvent.setup();
    renderTopBar({
      addActionsInBar: false,
      shareUrl: "https://openrift.test/collections/share/AbCdEfGhIjKl",
      collectionName: "Main binder",
    });

    await user.click(screen.getByRole("button", { name: "Collection actions" }));
    await user.click(await screen.findByRole("menuitem", { name: /print binder sheet/iu }));

    expect(
      await screen.findByRole("dialog", { name: "Print for your binder" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Main binder");
  });
});
