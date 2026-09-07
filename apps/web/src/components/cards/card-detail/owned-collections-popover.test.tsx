import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { Component } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FilterSearchProvider } from "@/lib/search-schemas";
import { useDisplayStore } from "@/stores/display-store";
import { useSearchScopeStore } from "@/stores/search-scope-store";
import { createStoreResetter } from "@/test/store-helpers";

const { linkSearches } = vi.hoisted(() => ({ linkSearches: [] as unknown[] }));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    search,
  }: {
    children: ReactNode;
    className?: string;
    search?: unknown;
  }) => {
    linkSearches.push(search);
    return <span className={className}>{children}</span>;
  },
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

// React 19 reports uncaught render errors via onUncaughtError, not by rethrowing
// from render(), so observing a thrown error here needs a boundary.
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
    linkSearches.length = 0;
    sessionMock.mockReturnValue({ data: { user: { id: "user-1" } } });
    vi.restoreAllMocks();
  });

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

  it("renders the owned badge with no FilterSearchProvider above it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { container, getByText } = render(<CatchBoundary>{renderPopover()}</CatchBoundary>);
    expect(container.querySelector("[data-caught]")).toBeNull();
    expect(getByText("2")).toBeTruthy();
  });

  it("links by short code with no provider when the default view is printings", async () => {
    useDisplayStore.getState().setDefaultCardView("printings");
    const { findByText } = render(renderPopover());

    await userEvent.click(await findByText("2"));
    await findByText("Binder");

    expect(linkSearches.at(-1)).toEqual({ search: "id:OGN-001", view: "printings" });
  });

  it("links by card name with no provider when the default view is cards", async () => {
    useDisplayStore.getState().setDefaultCardView("cards");
    const { findByText } = render(renderPopover());

    await userEvent.click(await findByText("2"));
    await findByText("Binder");

    expect(linkSearches.at(-1)).toEqual({ search: "Annie" });
  });

  it("prefers the provider's view over the display-store default", async () => {
    useDisplayStore.getState().setDefaultCardView("cards");
    const { findByText } = render(
      <FilterSearchProvider value={{ view: "printings" }}>{renderPopover()}</FilterSearchProvider>,
    );

    await userEvent.click(await findByText("2"));
    await findByText("Binder");

    expect(linkSearches.at(-1)).toEqual({ search: "id:OGN-001", view: "printings" });
  });
});
