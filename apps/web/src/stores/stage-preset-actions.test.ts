import type { OverlayPlateFields } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { captureStagePreset } from "@/lib/stage-preset-apply";
import { useDisplayStore } from "@/stores/display-store";
import { usePresentationStore } from "@/stores/presentation-store";
import { createStoreResetter } from "@/test/store-helpers";

import { applyStagePresetConfig } from "./stage-preset-actions";

const ALL_FIELDS: OverlayPlateFields = {
  name: true,
  code: true,
  stats: true,
  rulesText: true,
  flavorText: true,
};

const resetPresentation = createStoreResetter(usePresentationStore);
const resetDisplay = createStoreResetter(useDisplayStore);

beforeEach(() => {
  resetPresentation();
  resetDisplay();
});
afterEach(() => {
  resetPresentation();
  resetDisplay();
});

describe("applyStagePresetConfig", () => {
  it("moves only the switches the preset carries", () => {
    usePresentationStore.setState({ showText: true, cardScale: 0.5 });

    applyStagePresetConfig({ ground: "magenta" });

    const state = usePresentationStore.getState();
    expect(state.ground).toBe("magenta");
    expect(state.showText).toBe(true);
    expect(state.cardScale).toBe(0.5);
  });

  it("leaves the board's tile size alone when the preset says nothing about it", () => {
    useDisplayStore.getState().setTierTileStep(4);

    applyStagePresetConfig({ showText: true });

    expect(useDisplayStore.getState().tierTileStep).toBe(4);
  });

  it("merges plate fields into the stage's current ones", () => {
    usePresentationStore.setState({ plateFields: { ...ALL_FIELDS, name: false } });

    applyStagePresetConfig({ plateFields: { flavorText: false } });

    expect(usePresentationStore.getState().plateFields).toEqual({
      ...ALL_FIELDS,
      name: false,
      flavorText: false,
    });
  });

  it("changes nothing for an empty preset", () => {
    const before = usePresentationStore.getState();

    applyStagePresetConfig({});

    const after = usePresentationStore.getState();
    expect(after.cardScale).toBe(before.cardScale);
    expect(after.ground).toBe(before.ground);
    expect(after.plateFields).toEqual(before.plateFields);
  });

  it("round-trips a captured stage back onto the stores it came from", () => {
    usePresentationStore.setState({
      cardScale: 0.6,
      showText: true,
      ground: "green",
      plateFields: { ...ALL_FIELDS, stats: false },
    });
    useDisplayStore.getState().setTierTileStep(2);

    const config = captureStagePreset(usePresentationStore.getState(), 2);
    usePresentationStore.setState({
      cardScale: 1,
      showText: false,
      ground: "black",
      plateFields: ALL_FIELDS,
    });
    useDisplayStore.getState().setTierTileStep(5);
    applyStagePresetConfig(config);

    const state = usePresentationStore.getState();
    expect(state.cardScale).toBe(0.6);
    expect(state.showText).toBe(true);
    expect(state.ground).toBe("green");
    expect(state.plateFields.stats).toBe(false);
    expect(useDisplayStore.getState().tierTileStep).toBe(2);
  });
});
