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
vi.mock("@/features/cards/components/select-mode-actions", () => ({
  SelectModeActions: () => null,
}));

const { CollectionTopBar } = await import("./collection-top-bar");

// Renders the bar for a collection the viewer administers, so the ⋮ menu is
// present in every case and only optional pieces vary per test.
function renderTopBar(
  overrides: {
    hasCards?: boolean;
    showAddActions?: boolean;
    homeDecks?: { id: string; name: string }[];
    canShare?: boolean;
    canEdit?: boolean;
    canDelete?: boolean;
    canImport?: boolean;
    mode?: "browse" | "select";
    onEdit?: () => void;
    onDelete?: () => void;
    onShare?: () => void;
    onImport?: () => void;
    onExport?: () => void;
  } = {},
) {
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
      canShare
      canImport
      onEdit={() => {}}
      onDelete={() => {}}
      onShare={() => {}}
      onImport={() => {}}
      onExport={() => {}}
      {...overrides}
    />,
  );
}

describe("CollectionTopBar", () => {
  it("keeps Scan and Quick add in the bar whenever adding is available", () => {
    renderTopBar();

    expect(screen.getAllByRole("button", { name: /scan/iu }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Quick add" }).length).toBeGreaterThan(0);
  });

  it("still offers both actions on a collection holding no cards", () => {
    renderTopBar({ hasCards: false });

    expect(screen.getAllByRole("button", { name: /scan/iu }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Quick add" }).length).toBeGreaterThan(0);
  });

  it("drops both while the empty state carries its own", () => {
    renderTopBar({ showAddActions: false });

    expect(screen.queryByRole("button", { name: /scan/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Quick add" })).not.toBeInTheDocument();
  });

  it("never puts Scan or Quick add in the actions menu", async () => {
    const user = userEvent.setup();
    renderTopBar();

    await user.click(screen.getByRole("button", { name: "Collection actions" }));

    expect(screen.queryByRole("menuitem", { name: /scan/iu })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Quick add" })).not.toBeInTheDocument();
  });

  it("puts Share in the bar and never in the menu", async () => {
    const user = userEvent.setup();
    renderTopBar();

    expect(screen.getAllByRole("button", { name: "Share" }).length).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Collection actions" }));
    expect(screen.queryByRole("menuitem", { name: "Share" })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("menu")).not.toBeInTheDocument());
  });

  it("hides Share when the viewer can't share", () => {
    renderTopBar({ canShare: false });

    expect(screen.queryByRole("button", { name: "Share" })).not.toBeInTheDocument();
  });

  it("lists Edit, Import, Export, and Delete in that order", async () => {
    const user = userEvent.setup();
    renderTopBar();

    await user.click(screen.getByRole("button", { name: "Collection actions" }));

    const items = await screen.findAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Edit",
      "Import…",
      "Export…",
      "Delete collection",
    ]);
  });

  it("omits Edit when the viewer can't edit", async () => {
    const user = userEvent.setup();
    renderTopBar({ canEdit: false });

    await user.click(screen.getByRole("button", { name: "Collection actions" }));

    expect(screen.queryByRole("menuitem", { name: "Edit" })).not.toBeInTheDocument();
  });

  it("omits Import when the viewer can't add", async () => {
    const user = userEvent.setup();
    renderTopBar({ canImport: false });

    await user.click(screen.getByRole("button", { name: "Collection actions" }));

    expect(screen.queryByRole("menuitem", { name: "Import…" })).not.toBeInTheDocument();
  });

  it("always offers Export, even without edit, delete, or import rights", async () => {
    const user = userEvent.setup();
    renderTopBar({ canEdit: false, canDelete: false, canImport: false, canShare: false });

    await user.click(screen.getByRole("button", { name: "Collection actions" }));

    expect(await screen.findByRole("menuitem", { name: "Export…" })).toBeInTheDocument();
  });

  it("omits Delete when the viewer can't delete", async () => {
    const user = userEvent.setup();
    renderTopBar({ canDelete: false });

    await user.click(screen.getByRole("button", { name: "Collection actions" }));

    expect(screen.queryByRole("menuitem", { name: "Delete collection" })).not.toBeInTheDocument();
  });

  it("calls onImport and onExport from the menu", async () => {
    const user = userEvent.setup();
    const onImport = vi.fn();
    const onExport = vi.fn();
    renderTopBar({ onImport, onExport });

    await user.click(screen.getByRole("button", { name: "Collection actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Import…" }));
    expect(onImport).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Collection actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Export…" }));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});
