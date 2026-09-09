import type * as ReactRouter from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { hydratedMock, userIdMock, collectionsMapMock, navigateMock } = vi.hoisted(() => ({
  hydratedMock: vi.fn(() => true),
  userIdMock: vi.fn((): string | null => "user-1"),
  collectionsMapMock: vi.fn(() => new Map<string, { id: string }>()),
  navigateMock: vi.fn(),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual<typeof ReactRouter>("@tanstack/react-router");
  return {
    CatchBoundary: actual.CatchBoundary,
    useNavigate: () => navigateMock,
  };
});

vi.mock("@/hooks/use-hydrated", () => ({ useHydrated: hydratedMock }));
vi.mock("@/lib/auth-session", () => ({ useUserId: userIdMock }));
vi.mock("@/features/collections/hooks/use-collections", () => ({
  useCollectionsMap: collectionsMapMock,
}));

const { SharedCollectionAccessRedirect } = await import("./shared-collection-access-redirect");

describe("SharedCollectionAccessRedirect", () => {
  afterEach(() => {
    // mockReset, not mockClear, so a throwing implementation doesn't leak between tests.
    hydratedMock.mockReset();
    hydratedMock.mockReturnValue(true);
    userIdMock.mockReset();
    userIdMock.mockReturnValue("user-1");
    collectionsMapMock.mockReset();
    collectionsMapMock.mockReturnValue(new Map());
    navigateMock.mockReset();
    vi.restoreAllMocks();
  });

  it("forwards to the full view when the collection is one the viewer can open", () => {
    collectionsMapMock.mockReturnValue(new Map([["col-1", { id: "col-1" }]]));
    render(<SharedCollectionAccessRedirect collectionId="col-1" />);
    expect(navigateMock).toHaveBeenCalledWith({
      to: "/collections/$collectionId",
      params: { collectionId: "col-1" },
      replace: true,
    });
  });

  it("stays on the share view for a collection the viewer only has the share link for", () => {
    collectionsMapMock.mockReturnValue(new Map([["other", { id: "other" }]]));
    render(<SharedCollectionAccessRedirect collectionId="col-1" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("stays on the share view for anonymous viewers", () => {
    userIdMock.mockReturnValue(null);
    collectionsMapMock.mockReturnValue(new Map([["col-1", { id: "col-1" }]]));
    render(<SharedCollectionAccessRedirect collectionId="col-1" />);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(collectionsMapMock).not.toHaveBeenCalled();
  });

  it("does nothing before hydration so the public SSR output stays cacheable", () => {
    hydratedMock.mockReturnValue(false);
    collectionsMapMock.mockReturnValue(new Map([["col-1", { id: "col-1" }]]));
    render(<SharedCollectionAccessRedirect collectionId="col-1" />);
    expect(navigateMock).not.toHaveBeenCalled();
    expect(collectionsMapMock).not.toHaveBeenCalled();
  });

  it("stays out of the way when the collections lookup fails", () => {
    // The render error is expected; keep it out of the test output.
    vi.spyOn(console, "error").mockImplementation(() => {});
    collectionsMapMock.mockImplementation(() => {
      throw new Error("Session expired");
    });
    const { container } = render(<SharedCollectionAccessRedirect collectionId="col-1" />);
    expect(container.firstChild).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
