import type {
  AdminCardDetailResponse,
  AdminPrintingResponse,
  CandidateCardResponse,
  CandidatePrintingResponse,
} from "@openrift/shared/types/api/admin";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  fetchNext: vi.fn<() => Promise<string | null>>(() => Promise.resolve(null)),
  checkAllCards: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: false },
  checkAllPrintings: { mutateAsync: vi.fn(() => Promise.resolve()), isPending: false },
  toastSuccess: vi.fn(),
  hotkeys: new Map<string, (...args: unknown[]) => void>(),
  nextUncheckedArgs: { current: null as [string, Set<string> | null | undefined] | null },
  allCards: [] as { slug: string; setSlugs: string[] }[],
  cardList: [] as { cardSlug: string | null; unlinkedPrintingCount: number }[],
  cardListEnabled: { current: false },
}));

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate }));

vi.mock("@tanstack/react-hotkeys", () => ({
  useHotkey: (
    combo: string,
    handler: (...args: unknown[]) => void,
    options?: { enabled?: boolean },
  ) => {
    if (options?.enabled === false) {
      mocks.hotkeys.delete(combo);
    } else {
      mocks.hotkeys.set(combo, handler);
    }
  },
}));

vi.mock("@/features/admin/hooks/use-admin-card-queries", () => ({
  useAllCards: () => ({ data: mocks.allCards }),
  useNextUncheckedCard: (currentSlug: string, allowedSlugs?: Set<string> | null) => {
    mocks.nextUncheckedArgs.current = [currentSlug, allowedSlugs];
    return { fetchNext: mocks.fetchNext };
  },
  useAdminCardListWhen: (enabled: boolean) => {
    mocks.cardListEnabled.current = enabled;
    return { data: enabled ? mocks.cardList : undefined };
  },
}));

vi.mock("@/features/admin/hooks/use-admin-card-mutations", () => ({
  useCheckAllCandidateCards: () => mocks.checkAllCards,
  useCheckAllCandidatePrintings: () => mocks.checkAllPrintings,
}));

// The price filter is off in every case here, so the query never enables.
vi.mock("@/features/admin/hooks/use-unified-mappings", () => ({
  useUnifiedMappingsWhen: () => ({ data: undefined }),
}));

vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess } }));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { collectReviewCheckTargets, useCardReviewNavigation } from "./use-card-review-navigation";

function stubSource(overrides: Partial<CandidateCardResponse> = {}): CandidateCardResponse {
  return { id: "cc1", checkedAt: "2026-01-01T00:00:00Z", ...overrides } as CandidateCardResponse;
}

function stubPrinting(overrides: Partial<AdminPrintingResponse> = {}): AdminPrintingResponse {
  return { id: "p1", ...overrides } as AdminPrintingResponse;
}

function stubCandidatePrinting(
  overrides: Partial<CandidatePrintingResponse> = {},
): CandidatePrintingResponse {
  return {
    id: "cp1",
    printingId: "p1",
    checkedAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as CandidatePrintingResponse;
}

describe("collectReviewCheckTargets", () => {
  it("reports nothing to do when everything is already checked", () => {
    expect(
      collectReviewCheckTargets(
        [stubSource()],
        [stubPrinting()],
        [stubCandidatePrinting()],
        [{ candidates: [stubCandidatePrinting({ id: "cp2", printingId: null })] }],
      ),
    ).toEqual({ cardSources: false, printingIds: [], extraCandidateIds: [] });
  });

  it("flags the card sources only when one is unchecked", () => {
    expect(
      collectReviewCheckTargets([stubSource({ checkedAt: null })], [], [], []).cardSources,
    ).toBe(true);
  });

  it("collects only printings that still have an unchecked source", () => {
    const targets = collectReviewCheckTargets(
      [],
      [stubPrinting({ id: "p1" }), stubPrinting({ id: "p2" }), stubPrinting({ id: "p3" })],
      [
        stubCandidatePrinting({ id: "cp1", printingId: "p1", checkedAt: null }),
        stubCandidatePrinting({ id: "cp2", printingId: "p1" }),
        stubCandidatePrinting({ id: "cp3", printingId: "p2" }),
      ],
      [],
    );

    expect(targets.printingIds).toEqual(["p1"]);
  });

  it("collects the unchecked candidates of each ambiguous group separately", () => {
    const targets = collectReviewCheckTargets(
      [],
      [],
      [],
      [
        {
          candidates: [
            stubCandidatePrinting({ id: "a1", checkedAt: null }),
            stubCandidatePrinting({ id: "a2" }),
          ],
        },
        { candidates: [stubCandidatePrinting({ id: "b1" })] },
        { candidates: [stubCandidatePrinting({ id: "c1", checkedAt: null })] },
      ],
    );

    expect(targets.extraCandidateIds).toEqual([["a1"], ["c1"]]);
  });

  it("handles a card with no sources, printings or groups", () => {
    expect(collectReviewCheckTargets([], [], [], [])).toEqual({
      cardSources: false,
      printingIds: [],
      extraCandidateIds: [],
    });
  });
});

function stubDetail(overrides: Partial<AdminCardDetailResponse> = {}): AdminCardDetailResponse {
  return {
    card: { id: "card-uuid", name: "Yasuo" },
    sources: [],
    printings: [],
    candidatePrintings: [],
    candidatePrintingGroups: [],
    ...overrides,
  } as unknown as AdminCardDetailResponse;
}

function renderNav(options: Partial<Parameters<typeof useCardReviewNavigation>[0]> = {}) {
  return renderHook(() =>
    useCardReviewNavigation({
      identifier: "yasuo",
      detail: stubDetail(),
      isAdmin: true,
      invalidates: [],
      ...options,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.hotkeys.clear();
  mocks.nextUncheckedArgs.current = null;
  mocks.cardListEnabled.current = false;
  mocks.cardList = [];
  mocks.fetchNext.mockResolvedValue(null);
  mocks.allCards = [
    { slug: "ahri", setSlugs: ["ogn"] },
    { slug: "yasuo", setSlugs: ["ogn", "prox"] },
    { slug: "zed", setSlugs: ["prox"] },
  ];
});

describe("useCardReviewNavigation", () => {
  it("returns the neighbouring card slugs in list order", () => {
    const { result } = renderNav();

    expect(result.current.prevNextCards).toEqual({ prev: "ahri", next: "zed" });
  });

  it("scopes prev/next and the next-unchecked lookup to the active set filter", () => {
    const { result } = renderNav({ setSlug: "prox" });

    expect(result.current.prevNextCards).toEqual({ prev: null, next: "zed" });
    expect(mocks.nextUncheckedArgs.current?.[0]).toBe("yasuo");
    expect([...(mocks.nextUncheckedArgs.current?.[1] ?? [])]).toEqual(["yasuo", "zed"]);
  });

  it("carries the set and price filters through every navigation", () => {
    const { result } = renderNav({
      setSlug: "prox",
      listStatus: "prices-to-assign",
      priceScope: "cardtrader:FR",
    });

    act(() => {
      result.current.goToCard("zed");
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/admin/cards/$cardSlug",
      params: { cardSlug: "zed" },
      search: { set: "prox", status: "prices-to-assign", priceScope: "cardtrader:FR" },
    });
  });

  it("visits only cards with new printings while that filter is on", () => {
    mocks.cardList = [
      { cardSlug: "ahri", unlinkedPrintingCount: 0 },
      { cardSlug: "yasuo", unlinkedPrintingCount: 2 },
      { cardSlug: "zed", unlinkedPrintingCount: 1 },
      { cardSlug: null, unlinkedPrintingCount: 3 },
    ];
    const { result } = renderNav({ listStatus: "new-printings" });

    expect(mocks.cardListEnabled.current).toBe(true);
    expect(result.current.prevNextCards).toEqual({ prev: null, next: "zed" });
  });

  it("keeps navigating after the current card's new printings are accepted", () => {
    mocks.cardList = [
      { cardSlug: "ahri", unlinkedPrintingCount: 1 },
      { cardSlug: "yasuo", unlinkedPrintingCount: 0 },
      { cardSlug: "zed", unlinkedPrintingCount: 1 },
    ];
    const { result } = renderNav({ listStatus: "new-printings" });

    expect(result.current.prevNextCards).toEqual({ prev: "ahri", next: "zed" });
  });

  it("carries the new-printings filter through navigation, excluding the price scope", () => {
    const { result } = renderNav({ listStatus: "new-printings", priceScope: "cardmarket" });

    act(() => {
      result.current.goToList();
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/admin/cards",
      search: { status: "new-printings" },
    });
  });

  it("leaves the card list query disabled when no status filter is active", () => {
    renderNav();

    expect(mocks.cardListEnabled.current).toBe(false);
  });

  it("omits the price params when the filter is off", () => {
    const { result } = renderNav({ setSlug: "prox", priceScope: "cardtrader:FR" });

    act(() => {
      result.current.goToList();
    });

    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/admin/cards",
      search: { set: "prox" },
    });
  });

  it("checks every unchecked source and then advances to the next card", async () => {
    mocks.fetchNext.mockResolvedValue("zed");
    const { result } = renderNav({
      detail: stubDetail({
        sources: [stubSource({ checkedAt: null })],
        printings: [stubPrinting({ id: "p1" })],
        candidatePrintings: [
          stubCandidatePrinting({ id: "cp1", printingId: "p1", checkedAt: null }),
          stubCandidatePrinting({ id: "cp2", printingId: null, checkedAt: null }),
        ],
        candidatePrintingGroups: [{ expectedPrintingId: "OGN-001", shortCodes: ["cp2"] }],
      } as unknown as Partial<AdminCardDetailResponse>),
    });

    await act(async () => {
      await result.current.checkAllAndNext();
    });

    expect(mocks.checkAllCards.mutateAsync).toHaveBeenCalledWith("card-uuid");
    expect(mocks.checkAllPrintings.mutateAsync).toHaveBeenCalledWith({ printingId: "p1" });
    expect(mocks.checkAllPrintings.mutateAsync).toHaveBeenCalledWith({ extraIds: ["cp2"] });
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { cardSlug: "zed" } }),
    );
  });

  it("fires no check mutation when the card is fully reviewed, and returns to the list", async () => {
    const { result } = renderNav();

    await act(async () => {
      await result.current.checkAllAndNext();
    });

    expect(mocks.checkAllCards.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.checkAllPrintings.mutateAsync).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("All cards reviewed!");
    expect(mocks.navigate).toHaveBeenCalledWith({ to: "/admin/cards", search: {} });
  });

  it("does nothing while the detail is still loading", async () => {
    const { result } = renderNav({ detail: undefined });

    await act(async () => {
      await result.current.checkAllAndNext();
    });

    expect(mocks.fetchNext).not.toHaveBeenCalled();
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("does nothing when the detail carries no accepted card", async () => {
    const { result } = renderNav({ detail: stubDetail({ card: null }) });

    await act(async () => {
      await result.current.checkAllAndNext();
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("clears the run state when a check mutation rejects", async () => {
    mocks.checkAllCards.mutateAsync.mockRejectedValueOnce(new Error("boom"));
    const { result } = renderNav({
      detail: stubDetail({ sources: [stubSource({ checkedAt: null })] }),
    });

    await act(async () => {
      await expect(result.current.checkAllAndNext()).rejects.toThrow("boom");
    });

    expect(result.current.isCheckingAll).toBe(false);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("moves with the same selection as the prev/next buttons on the arrow hotkeys", () => {
    renderNav();

    act(() => {
      mocks.hotkeys.get("Mod+ArrowLeft")?.();
    });
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { cardSlug: "ahri" } }),
    );

    act(() => {
      mocks.hotkeys.get("Mod+ArrowRight")?.();
    });
    expect(mocks.navigate).toHaveBeenCalledWith(
      expect.objectContaining({ params: { cardSlug: "zed" } }),
    );
  });

  it("stays put on an arrow hotkey at the end of the run", () => {
    mocks.allCards = [{ slug: "yasuo", setSlugs: [] }];
    renderNav();

    act(() => {
      mocks.hotkeys.get("Mod+ArrowLeft")?.();
      mocks.hotkeys.get("Mod+ArrowRight")?.();
    });

    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("registers the check-all shortcut for admins only", () => {
    renderNav({ isAdmin: false });
    expect(mocks.hotkeys.has("Mod+Shift+Enter")).toBe(false);

    renderNav({ isAdmin: true });
    expect(mocks.hotkeys.has("Mod+Shift+Enter")).toBe(true);
  });
});
