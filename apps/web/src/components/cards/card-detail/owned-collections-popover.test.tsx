import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { Component } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterSearchProvider } from "@/lib/search-schemas";
import { useDisplayStore } from "@/stores/display-store";
import { useSearchScopeStore } from "@/stores/search-scope-store";
import { createStoreResetter } from "@/test/store-helpers";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <span className={className}>{children}</span>
  ),
}));

const { sessionMock } = vi.hoisted(() => ({
  sessionMock: vi.fn((): { data: { user: { id: string } } | null } => ({
    data: { user: { id: "user-1" } },
  })),
}));

vi.mock("@/lib/auth-session", () => ({
  useSession: sessionMock,
}));

vi.mock("@/hooks/use-owned-count", () => ({
  useOwnedCount: () => ({ data: { "printing-1": 2 } }),
  useOwnedCollections: () => ({
    data: [{ collectionId: "col-1", collectionName: "Binder", count: 2 }],
  }),
  useOwnedCollectionsByVariants: () => ({ data: [] }),
}));

vi.mock("@/hooks/use-enums", () => ({
  useEnumOrders: () => ({ labels: { finishes: {} } }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { OwnedCollectionsPopover } from "./owned-collections-popover";

// React 19 reports uncaught render errors through onUncaughtError instead of
// rethrowing from render(), so the no-provider case needs a boundary to
// observe the thrown error deterministically.
class CatchBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return <div data-caught>{this.state.error.message}</div>;
    }
    return this.props.children;
  }
}

function renderPopover() {
  return <OwnedCollectionsPopover printingId="printing-1" cardName="Annie" shortCode="OGN-001" />;
}

describe("OwnedCollectionsPopover", () => {
  const resetDisplayStore = createStoreResetter(useDisplayStore);
  const resetSearchScopeStore = createStoreResetter(useSearchScopeStore);

  afterEach(() => {
    resetDisplayStore();
    resetSearchScopeStore();
    sessionMock.mockReturnValue({ data: { user: { id: "user-1" } } });
    vi.restoreAllMocks();
  });

  // Regression: /decks/share/$token rendered the card detail pane without a
  // FilterSearchProvider, so every card click crashed here.
  // The share page provides an empty filter value; that must be enough for
  // the popover's whole hook chain.
  it("renders the owned badge under an empty filter context like the share page provides", () => {
    const { getByText } = render(
      <FilterSearchProvider value={{}}>{renderPopover()}</FilterSearchProvider>,
    );
    expect(getByText("2")).toBeTruthy();
  });

  it("renders nothing for anonymous viewers under an empty filter context", () => {
    sessionMock.mockReturnValue({ data: null });
    const { container } = render(
      <FilterSearchProvider value={{}}>{renderPopover()}</FilterSearchProvider>,
    );
    expect(container.firstChild).toBeNull();
  });

  it("surfaces the provider error when rendered without a FilterSearchProvider", () => {
    // The render error is expected; keep it out of the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<CatchBoundary>{renderPopover()}</CatchBoundary>);
    expect(container.querySelector("[data-caught]")?.textContent).toBe(
      "useFilterSearch must be used within a <FilterSearchProvider>",
    );
  });
});
