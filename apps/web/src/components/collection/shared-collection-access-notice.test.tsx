import type * as ReactRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { hydratedMock, userIdMock, collectionsMapMock } = vi.hoisted(() => ({
  hydratedMock: vi.fn(() => true),
  userIdMock: vi.fn((): string | null => "user-1"),
  collectionsMapMock: vi.fn(() => new Map<string, { id: string }>()),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof ReactRouter>("@tanstack/react-router");
  return {
    CatchBoundary: actual.CatchBoundary,
    Link: ({ children }: { children: ReactNode }) => <a href="/stub">{children}</a>,
  };
});

vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: hydratedMock }));
vi.mock("@/lib/auth-session", () => ({ useUserId: userIdMock }));
vi.mock("@/hooks/use-collections", () => ({ useCollectionsMap: collectionsMapMock }));

const { SharedCollectionAccessNotice } = await import("./shared-collection-access-notice");

const NOTICE = /you have full access to this collection/iu;

describe("SharedCollectionAccessNotice", () => {
  afterEach(() => {
    // mockReset, not mockClear, so a throwing implementation doesn't leak between tests.
    hydratedMock.mockReset();
    hydratedMock.mockReturnValue(true);
    userIdMock.mockReset();
    userIdMock.mockReturnValue("user-1");
    collectionsMapMock.mockReset();
    collectionsMapMock.mockReturnValue(new Map());
    vi.restoreAllMocks();
  });

  it("links to the full view when the collection is one the viewer can open", () => {
    collectionsMapMock.mockReturnValue(new Map([["col-1", { id: "col-1" }]]));
    render(<SharedCollectionAccessNotice collectionId="col-1" />);
    expect(screen.getByText(NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /open the full view/iu })).toBeInTheDocument();
  });

  it("renders nothing for a collection the viewer only has the share link for", () => {
    collectionsMapMock.mockReturnValue(new Map([["other", { id: "other" }]]));
    const { container } = render(<SharedCollectionAccessNotice collectionId="col-1" />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for anonymous viewers", () => {
    userIdMock.mockReturnValue(null);
    collectionsMapMock.mockReturnValue(new Map([["col-1", { id: "col-1" }]]));
    const { container } = render(<SharedCollectionAccessNotice collectionId="col-1" />);
    expect(container.firstChild).toBeNull();
    expect(collectionsMapMock).not.toHaveBeenCalled();
  });

  it("renders nothing before hydration so the public SSR output stays cacheable", () => {
    hydratedMock.mockReturnValue(false);
    collectionsMapMock.mockReturnValue(new Map([["col-1", { id: "col-1" }]]));
    const { container } = render(<SharedCollectionAccessNotice collectionId="col-1" />);
    expect(container.firstChild).toBeNull();
    expect(collectionsMapMock).not.toHaveBeenCalled();
  });

  it("stays out of the way when the collections lookup fails", () => {
    // The render error is expected; keep it out of the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    collectionsMapMock.mockImplementation(() => {
      throw new Error("Session expired");
    });
    const { container } = render(<SharedCollectionAccessNotice collectionId="col-1" />);
    expect(container.firstChild).toBeNull();
  });
});
