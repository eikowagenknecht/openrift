import type { OverlayBoard } from "@openrift/shared";
import { describe, expect, it, vi } from "vitest";

import { createOverlayBoardSync } from "./overlay-board-sync";

const BOARD: Omit<OverlayBoard, "revealCount"> = {
  title: "Origins, ranked",
  tiers: [{ label: "S", cards: [{ cardId: "card-a", printingId: null }] }],
  direction: "best-first",
};

function harness() {
  const pushBoard = vi.fn((_board: OverlayBoard) => Promise.resolve());
  const setReveal = vi.fn((_revealCount: number) => Promise.resolve());
  return { sync: createOverlayBoardSync({ pushBoard, setReveal }), pushBoard, setReveal };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("createOverlayBoardSync", () => {
  it("pushes the board with the reveal folded in", () => {
    const { sync, pushBoard } = harness();

    sync.send({ board: BOARD, revealCount: 3 });

    expect(pushBoard).toHaveBeenCalledWith({ ...BOARD, revealCount: 3 });
  });

  it("steps the board already up without resending it", () => {
    const { sync, setReveal, pushBoard } = harness();

    sync.send({ board: null, revealCount: 2 });

    expect(setReveal).toHaveBeenCalledWith(2);
    expect(pushBoard).not.toHaveBeenCalled();
  });

  it("sends only the latest position once the wire is free", async () => {
    const { sync, setReveal } = harness();
    sync.send({ board: null, revealCount: 1 });
    sync.send({ board: null, revealCount: 2 });
    sync.send({ board: null, revealCount: 3 });

    expect(setReveal).toHaveBeenCalledTimes(1);

    await settle();

    expect(setReveal).toHaveBeenCalledTimes(2);
    expect(setReveal).toHaveBeenLastCalledWith(3);
  });

  it("never drops the position the run actually stopped on", async () => {
    const { sync, setReveal } = harness();
    sync.send({ board: null, revealCount: 1 });
    sync.send({ board: null, revealCount: 5 });

    await settle();

    expect(setReveal).toHaveBeenLastCalledWith(5);
  });

  it("folds a step into a board push that is still waiting", async () => {
    const { sync, pushBoard, setReveal } = harness();
    sync.send({ board: null, revealCount: 0 });
    sync.send({ board: BOARD, revealCount: 1 });
    sync.send({ board: null, revealCount: 2 });

    await settle();

    expect(pushBoard).toHaveBeenCalledWith({ ...BOARD, revealCount: 2 });
    expect(setReveal).toHaveBeenCalledTimes(1);
  });

  it("lets a later board push replace an earlier one", async () => {
    const { sync, pushBoard } = harness();
    sync.send({ board: BOARD, revealCount: 0 });
    sync.send({ board: { ...BOARD, direction: "worst-first" }, revealCount: 0 });

    await settle();

    expect(pushBoard).toHaveBeenLastCalledWith({
      ...BOARD,
      direction: "worst-first",
      revealCount: 0,
    });
  });

  it("carries on after a refused call", async () => {
    const { sync, setReveal } = harness();
    setReveal.mockImplementationOnce(() => Promise.reject(new Error("nope")));
    sync.send({ board: null, revealCount: 1 });
    sync.send({ board: null, revealCount: 2 });

    await settle();

    expect(setReveal).toHaveBeenLastCalledWith(2);
  });

  it("drops what is waiting when the board is coming down", async () => {
    const { sync, setReveal } = harness();
    sync.send({ board: null, revealCount: 1 });
    sync.send({ board: null, revealCount: 2 });

    sync.cancel();
    await settle();

    expect(setReveal).toHaveBeenCalledTimes(1);
  });

  it("starts sending again after a cancel", async () => {
    const { sync, setReveal } = harness();
    sync.send({ board: null, revealCount: 1 });
    sync.cancel();
    await settle();

    sync.send({ board: null, revealCount: 4 });

    expect(setReveal).toHaveBeenLastCalledWith(4);
  });
});
