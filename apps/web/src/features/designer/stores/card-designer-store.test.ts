import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createStoreResetter } from "@/test/store-helpers";

import { useCardDesignerStore } from "./card-designer-store";

const reset = createStoreResetter(useCardDesignerStore);

beforeEach(reset);
afterEach(reset);

describe("card-designer-store", () => {
  it("sets scalar and array card fields", () => {
    useCardDesignerStore.getState().setCardField("name", "Ahri, Alluring");
    useCardDesignerStore.getState().setCardField("energy", 3);
    useCardDesignerStore.getState().setCardField("domains", ["fury", "mind"]);
    useCardDesignerStore.getState().setCardField("tags", ["Ahri"]);

    const { card } = useCardDesignerStore.getState();
    expect(card.name).toBe("Ahri, Alluring");
    expect(card.energy).toBe(3);
    expect(card.domains).toEqual(["fury", "mind"]);
    expect(card.tags).toEqual(["Ahri"]);
  });

  it("stores an uploaded image with its aspect and a neutral transform", () => {
    useCardDesignerStore.getState().setImageTransform({ scale: 2, offsetX: 0.3 });
    useCardDesignerStore.getState().setImage("data:image/png;base64,AAAA", 1.5);

    expect(useCardDesignerStore.getState().background).toEqual({
      dataUrl: "data:image/png;base64,AAAA",
      aspect: 1.5,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("clears the image back to defaults", () => {
    useCardDesignerStore.getState().setImage("data:image/png;base64,AAAA", 1.5);
    useCardDesignerStore.getState().clearImage();

    expect(useCardDesignerStore.getState().background).toEqual({
      dataUrl: null,
      aspect: null,
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });

  it("clamps the transform on update using zoom (no aspect set)", () => {
    useCardDesignerStore.getState().setImageTransform({ scale: 0.1, offsetX: 0.5, offsetY: 0.5 });
    // scale clamps to 1, which (with no overflow) forbids any pan
    expect(useCardDesignerStore.getState().background).toMatchObject({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    });

    useCardDesignerStore.getState().setImageTransform({ scale: 2, offsetX: 9, offsetY: -9 });
    // scale 2 -> max pan of (2-1)/2 = 0.5 of the card
    expect(useCardDesignerStore.getState().background).toMatchObject({
      scale: 2,
      offsetX: 0.5,
      offsetY: -0.5,
    });
  });

  it("allows vertical pan at zoom 1 for a portrait image (aspect-aware clamp)", () => {
    useCardDesignerStore.getState().setImage("data:image/png;base64,AAAA", 0.5);
    useCardDesignerStore.getState().setImageTransform({ offsetY: 9 });
    expect(useCardDesignerStore.getState().background.offsetY).toBeGreaterThan(0);
  });

  it("toggles the openrift.app attribution (on by default)", () => {
    expect(useCardDesignerStore.getState().showAttribution).toBe(true);
    useCardDesignerStore.getState().setShowAttribution(false);
    expect(useCardDesignerStore.getState().showAttribution).toBe(false);
  });

  it("resets everything", () => {
    useCardDesignerStore.getState().setCardField("name", "Temp");
    useCardDesignerStore.getState().setImage("data:image/png;base64,AAAA", 1.5);
    useCardDesignerStore.getState().setShowAttribution(false);
    useCardDesignerStore.getState().reset();

    const state = useCardDesignerStore.getState();
    expect(state.card.name).toBe("");
    expect(state.card.domains).toEqual([]);
    expect(state.background.dataUrl).toBeNull();
    expect(state.background.aspect).toBeNull();
    expect(state.showAttribution).toBe(true);
  });
});
