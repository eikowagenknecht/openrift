import type { TierRow } from "@openrift/shared/types/api/tier-list";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockPushBoard, mockSetReveal, mockClear } = vi.hoisted(() => ({
  mockPushBoard: vi.fn(() => Promise.resolve()),
  mockSetReveal: vi.fn(() => Promise.resolve()),
  mockClear: vi.fn(),
}));

vi.mock("@/hooks/use-overlay", () => ({
  usePushOverlayBoard: () => ({ mutateAsync: mockPushBoard }),
  useSetOverlayBoardReveal: () => ({ mutateAsync: mockSetReveal }),
  useClearOverlay: () => ({ mutate: mockClear }),
}));

// oxlint-disable-next-line import/first -- must import after vi.mock
import { useOverlayBoardSync } from "./use-overlay-board-sync";

const TIERS: TierRow[] = [
  { label: "S", cards: [{ cardId: "card-a", printingId: null }] },
  { label: "A", cards: [{ cardId: "card-b", printingId: null }] },
];

interface SyncProps {
  enabled: boolean;
  paused: boolean;
  title: string;
  tiers: readonly TierRow[];
  direction: "best-first" | "worst-first";
  revealCount: number;
}

const BASE: SyncProps = {
  enabled: false,
  paused: false,
  title: "Origins, ranked",
  tiers: TIERS,
  direction: "best-first",
  revealCount: 0,
};

function renderSync(props: Partial<SyncProps> = {}) {
  return renderHook((current: SyncProps) => useOverlayBoardSync(current), {
    initialProps: { ...BASE, ...props },
  });
}

/** Only the first call of a run goes out synchronously; this drains the rest. */
async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useOverlayBoardSync while switched off", () => {
  it("sends nothing", () => {
    renderSync();
    expect(mockPushBoard).not.toHaveBeenCalled();
    expect(mockSetReveal).not.toHaveBeenCalled();
  });

  it("does not clear a channel it never touched", () => {
    renderSync({ revealCount: 2 });
    expect(mockClear).not.toHaveBeenCalled();
  });
});

describe("useOverlayBoardSync switched on", () => {
  it("puts the board up as it stands", () => {
    renderSync({ enabled: true, revealCount: 2 });

    expect(mockPushBoard).toHaveBeenCalledWith({
      board: { title: "Origins, ranked", tiers: TIERS, revealCount: 2, direction: "best-first" },
    });
  });

  it("steps the reveal as the run moves, without resending the board", async () => {
    const { rerender } = renderSync({ enabled: true });
    mockPushBoard.mockClear();

    rerender({ ...BASE, enabled: true, revealCount: 1 });
    await settle();

    expect(mockSetReveal).toHaveBeenCalledWith({ revealCount: 1 });
    expect(mockPushBoard).not.toHaveBeenCalled();
  });

  it("pushes the whole board again when the direction flips", async () => {
    const { rerender } = renderSync({ enabled: true, revealCount: 1 });
    mockPushBoard.mockClear();

    rerender({ ...BASE, enabled: true, revealCount: 1, direction: "worst-first" });
    await settle();

    expect(mockPushBoard).toHaveBeenCalledWith({
      board: expect.objectContaining({ direction: "worst-first", revealCount: 1 }),
    });
  });

  it("pushes the whole board again when the ranking itself changed", async () => {
    const { rerender } = renderSync({ enabled: true });
    mockPushBoard.mockClear();
    const edited: TierRow[] = [{ label: "S", cards: [] }];

    rerender({ ...BASE, enabled: true, tiers: edited });
    await settle();

    expect(mockPushBoard).toHaveBeenCalledWith({
      board: expect.objectContaining({ tiers: edited }),
    });
  });

  it("takes the board down when it is switched off", () => {
    const { rerender } = renderSync({ enabled: true });

    rerender({ ...BASE, enabled: false });

    expect(mockClear).toHaveBeenCalledTimes(1);
  });

  it("leaves the board up when the stage closes", () => {
    const { unmount } = renderSync({ enabled: true });

    unmount();

    expect(mockClear).not.toHaveBeenCalled();
  });
});

describe("useOverlayBoardSync while editing", () => {
  it("freezes the board on stream rather than following the edits", () => {
    const { rerender } = renderSync({ enabled: true });
    mockPushBoard.mockClear();

    rerender({ ...BASE, enabled: true, paused: true });
    rerender({ ...BASE, enabled: true, paused: true, tiers: [{ label: "S", cards: [] }] });

    expect(mockPushBoard).not.toHaveBeenCalled();
    expect(mockSetReveal).not.toHaveBeenCalled();
    expect(mockClear).not.toHaveBeenCalled();
  });

  it("sends the changed ranking in one push on the way back to the show", async () => {
    const edited: TierRow[] = [{ label: "S", cards: [] }];
    const { rerender } = renderSync({ enabled: true });
    await settle();
    rerender({ ...BASE, enabled: true, paused: true, tiers: edited });
    mockPushBoard.mockClear();

    rerender({ ...BASE, enabled: true, paused: false, tiers: edited });
    await settle();

    expect(mockPushBoard).toHaveBeenCalledTimes(1);
    expect(mockPushBoard).toHaveBeenCalledWith({
      board: expect.objectContaining({ tiers: edited }),
    });
  });

  it("still takes the board down if the switch goes off mid-edit", () => {
    const { rerender } = renderSync({ enabled: true });

    rerender({ ...BASE, enabled: true, paused: true });
    rerender({ ...BASE, enabled: false, paused: true });

    expect(mockClear).toHaveBeenCalledTimes(1);
  });
});
