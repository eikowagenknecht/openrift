import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSelectionStore } from "@/stores/selection-store";
import { resetIdCounter, stubCardViewerItem } from "@/test/factories";
import type { stubPrinting } from "@/test/factories";
import { createStoreResetter } from "@/test/store-helpers";

import { useCardDeepLink } from "./use-card-deep-link";

const navigateMock = vi.fn();
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

let resetStore: () => void;

beforeEach(() => {
  resetStore = createStoreResetter(useSelectionStore);
  resetIdCounter();
  navigateMock.mockReset();
});

afterEach(() => {
  resetStore();
});

describe("useCardDeepLink", () => {
  it("selects the linked printing and strips the param from the URL", () => {
    const item = stubCardViewerItem({ id: "p1" });
    renderHook(() =>
      useCardDeepLink({
        linkedPrintingId: "p1",
        printingsById: { p1: item.printing },
        items: [item],
      }),
    );

    expect(useSelectionStore.getState().selectedCard?.id).toBe("p1");
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });

  it("passes resetScroll: false so the router does not wipe the CardGrid scroll (regression)", () => {
    const item = stubCardViewerItem({ id: "p1" });
    renderHook(() =>
      useCardDeepLink({
        linkedPrintingId: "p1",
        printingsById: { p1: item.printing },
        items: [item],
      }),
    );

    expect(navigateMock).toHaveBeenCalledWith(
      expect.objectContaining({ to: ".", replace: true, resetScroll: false }),
    );
  });

  it("does nothing when there is no linked printing id", () => {
    renderHook(() =>
      useCardDeepLink({ linkedPrintingId: undefined, printingsById: {}, items: [] }),
    );

    expect(useSelectionStore.getState().selectedCard).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("does nothing when the linked printing is not in printingsById (not loaded yet)", () => {
    renderHook(() =>
      useCardDeepLink({ linkedPrintingId: "p-missing", printingsById: {}, items: [] }),
    );

    expect(useSelectionStore.getState().selectedCard).toBeNull();
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it("runs at most once even if items change after the first call", () => {
    const item = stubCardViewerItem({ id: "p1" });
    const { rerender } = renderHook<
      void,
      { printingsById: Record<string, ReturnType<typeof stubPrinting>> }
    >(
      ({ printingsById }) =>
        useCardDeepLink({
          linkedPrintingId: "p1",
          printingsById,
          items: [item],
        }),
      { initialProps: { printingsById: { p1: item.printing } } },
    );

    expect(navigateMock).toHaveBeenCalledTimes(1);

    const other = stubCardViewerItem({ id: "p2" });
    rerender({ printingsById: { p1: item.printing, p2: other.printing } });

    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});
