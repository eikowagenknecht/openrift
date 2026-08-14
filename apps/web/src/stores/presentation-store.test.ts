import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import {
  clampCardScale,
  MAX_CARD_SCALE,
  MIN_CARD_SCALE,
  usePresentationStore,
} from "./presentation-store";

const reset = createStoreResetter(usePresentationStore);

beforeEach(reset);
afterEach(reset);

describe("presentation store", () => {
  it("starts with every layer off — the card alone is the default show", () => {
    const state = usePresentationStore.getState();
    expect(state.showText).toBe(false);
    expect(state.showStrip).toBe(false);
    expect(state.showHelp).toBe(false);
  });

  it("toggles the text panel independently of the strip", () => {
    usePresentationStore.getState().toggleText();

    expect(usePresentationStore.getState().showText).toBe(true);
    expect(usePresentationStore.getState().showStrip).toBe(false);
  });

  it("toggles the strip independently of the text panel", () => {
    usePresentationStore.getState().toggleStrip();

    expect(usePresentationStore.getState().showStrip).toBe(true);
    expect(usePresentationStore.getState().showText).toBe(false);
  });

  it("toggles back off", () => {
    usePresentationStore.getState().toggleText();
    usePresentationStore.getState().toggleText();

    expect(usePresentationStore.getState().showText).toBe(false);
  });

  it("closes help without touching the other layers", () => {
    usePresentationStore.getState().toggleText();
    usePresentationStore.getState().toggleHelp();

    usePresentationStore.getState().closeHelp();

    expect(usePresentationStore.getState().showHelp).toBe(false);
    expect(usePresentationStore.getState().showText).toBe(true);
  });

  it("closing help when it is already closed is a no-op", () => {
    usePresentationStore.getState().closeHelp();

    expect(usePresentationStore.getState().showHelp).toBe(false);
  });

  it("starts a ranking on the whole board, walked from the top tier down", () => {
    const state = usePresentationStore.getState();
    expect(state.boardMode).toBe(true);
    expect(state.reveal).toBe(false);
    expect(state.direction).toBe("best-first");
  });

  it("drops the board layout for one card at a time", () => {
    usePresentationStore.getState().toggleBoard();

    expect(usePresentationStore.getState().boardMode).toBe(false);
    // The reveal is a board shape, so switching layouts must not silently arm it.
    expect(usePresentationStore.getState().reveal).toBe(false);
  });

  it("turns the reveal on without touching the layout", () => {
    usePresentationStore.getState().toggleReveal();

    expect(usePresentationStore.getState().reveal).toBe(true);
    expect(usePresentationStore.getState().boardMode).toBe(true);
  });

  it("flips the run between the two ends of the ladder", () => {
    usePresentationStore.getState().toggleDirection();

    expect(usePresentationStore.getState().direction).toBe("worst-first");

    usePresentationStore.getState().toggleDirection();

    expect(usePresentationStore.getState().direction).toBe("best-first");
  });

  it("starts with the card filling the stage", () => {
    expect(usePresentationStore.getState().cardScale).toBe(MAX_CARD_SCALE);
  });

  it("sets a card scale inside the supported range", () => {
    usePresentationStore.getState().setCardScale(0.6);

    expect(usePresentationStore.getState().cardScale).toBe(0.6);
  });

  it("clamps a scale outside the range instead of shrinking the card to nothing", () => {
    usePresentationStore.getState().setCardScale(0);

    expect(usePresentationStore.getState().cardScale).toBe(MIN_CARD_SCALE);

    usePresentationStore.getState().setCardScale(4);

    expect(usePresentationStore.getState().cardScale).toBe(MAX_CARD_SCALE);
  });
});

describe("clampCardScale", () => {
  it("passes a scale already in range through untouched", () => {
    expect(clampCardScale(0.75)).toBe(0.75);
  });

  it("clamps at both ends", () => {
    expect(clampCardScale(-1)).toBe(MIN_CARD_SCALE);
    expect(clampCardScale(2)).toBe(MAX_CARD_SCALE);
  });

  it("falls back to full size for a value that isn't a number", () => {
    expect(clampCardScale(Number.NaN)).toBe(MAX_CARD_SCALE);
    expect(clampCardScale(Number.POSITIVE_INFINITY)).toBe(MAX_CARD_SCALE);
  });
});
