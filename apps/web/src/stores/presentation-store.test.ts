import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { usePresentationStore } from "./presentation-store";

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
});
