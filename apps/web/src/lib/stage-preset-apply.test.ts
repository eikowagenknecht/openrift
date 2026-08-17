import type { OverlayPayload, OverlayPlateFields } from "@openrift/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useDisplayStore } from "@/stores/display-store";
import { usePresentationStore } from "@/stores/presentation-store";
import { createStoreResetter } from "@/test/store-helpers";

import {
  applyStagePresetConfig,
  captureOverlayPreset,
  captureStagePreset,
  presetToOverlaySettings,
  presetToStagePatch,
} from "./stage-preset-apply";

const ALL_FIELDS: OverlayPlateFields = {
  name: true,
  code: true,
  stats: true,
  rulesText: true,
  flavorText: true,
};

const PAYLOAD: OverlayPayload = {
  printingId: "printing-1",
  board: null,
  hidden: false,
  showPlate: true,
  platePosition: "left",
  plateFields: { ...ALL_FIELDS, flavorText: false },
  qrUrl: "https://openrift.app/decks/share/abc",
  corner: "top-left",
  scale: 55,
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

describe("presetToStagePatch", () => {
  it("moves nothing for an empty preset", () => {
    expect(presetToStagePatch({}, ALL_FIELDS)).toEqual({ stage: {} });
  });

  it("carries the stage fields it was saved with", () => {
    const patch = presetToStagePatch(
      { cardScale: 0.8, showText: true, ground: "green", tierTileStep: 3 },
      ALL_FIELDS,
    );

    expect(patch).toEqual({
      stage: { cardScale: 0.8, showText: true, ground: "green" },
      tierTileStep: 3,
    });
  });

  it("keeps a false switch, which is a value rather than an absence", () => {
    expect(presetToStagePatch({ showText: false }, ALL_FIELDS).stage).toEqual({ showText: false });
  });

  it("keeps a zero tile step out of the same trap", () => {
    expect(presetToStagePatch({ tierTileStep: 0 }, ALL_FIELDS).tierTileStep).toBe(0);
  });

  it("merges plate fields over the ones the stage already has", () => {
    const patch = presetToStagePatch({ plateFields: { flavorText: false } }, ALL_FIELDS);

    expect(patch.stage.plateFields).toEqual({ ...ALL_FIELDS, flavorText: false });
  });

  it("clamps a card scale from outside the supported range", () => {
    expect(presetToStagePatch({ cardScale: 9 }, ALL_FIELDS).stage.cardScale).toBe(1);
    expect(presetToStagePatch({ cardScale: 0.05 }, ALL_FIELDS).stage.cardScale).toBe(0.4);
  });

  it("ignores the overlay-only half of a preset", () => {
    const patch = presetToStagePatch(
      { corner: "top-right", scale: 40, showPlate: true },
      ALL_FIELDS,
    );

    expect(patch).toEqual({ stage: {} });
  });
});

describe("presetToOverlaySettings", () => {
  it("sends nothing for an empty preset", () => {
    expect(presetToOverlaySettings({})).toEqual({});
  });

  it("sends every overlay field the preset sets", () => {
    expect(
      presetToOverlaySettings({
        showPlate: false,
        platePosition: "below",
        plateFields: { rulesText: true },
        qrUrl: "https://openrift.app",
        corner: "bottom-left",
        scale: 40,
      }),
    ).toEqual({
      showPlate: false,
      platePosition: "below",
      plateFields: { rulesText: true },
      qrUrl: "https://openrift.app",
      corner: "bottom-left",
      scale: 40,
    });
  });

  it("sends a null QR url, which hides the code rather than leaving it alone", () => {
    expect(presetToOverlaySettings({ qrUrl: null })).toEqual({ qrUrl: null });
  });

  it("leaves the QR alone when the preset says nothing about it", () => {
    expect("qrUrl" in presetToOverlaySettings({ corner: "top-left" })).toBe(false);
  });

  it("ignores the presentation-only half of a preset", () => {
    expect(
      presetToOverlaySettings({
        cardScale: 0.6,
        showText: true,
        ground: "magenta",
        tierTileStep: 2,
      }),
    ).toEqual({});
  });
});

describe("captureStagePreset", () => {
  it("writes the whole stage dressing, not just what differs from the defaults", () => {
    expect(
      captureStagePreset(
        { cardScale: 0.75, showText: true, ground: "magenta", plateFields: ALL_FIELDS },
        4,
      ),
    ).toEqual({
      cardScale: 0.75,
      showText: true,
      ground: "magenta",
      plateFields: ALL_FIELDS,
      tierTileStep: 4,
    });
  });

  it("copies the plate fields so a later toggle doesn't rewrite the saved preset", () => {
    const plateFields = { ...ALL_FIELDS };
    const config = captureStagePreset(
      { cardScale: 1, showText: false, ground: "black", plateFields },
      0,
    );

    plateFields.name = false;

    expect(config.plateFields?.name).toBe(true);
  });
});

describe("captureOverlayPreset", () => {
  it("writes the scene's dressing and leaves the card out of it", () => {
    const config = captureOverlayPreset(PAYLOAD);

    expect(config).toEqual({
      showPlate: true,
      platePosition: "left",
      plateFields: { ...ALL_FIELDS, flavorText: false },
      qrUrl: "https://openrift.app/decks/share/abc",
      corner: "top-left",
      scale: 55,
    });
    expect("printingId" in config).toBe(false);
  });

  it("keeps an absent QR as an explicit null, so recall hides the code", () => {
    expect(captureOverlayPreset({ ...PAYLOAD, qrUrl: null }).qrUrl).toBeNull();
  });

  it("round-trips through the settings patch unchanged", () => {
    expect(presetToOverlaySettings(captureOverlayPreset(PAYLOAD))).toEqual({
      showPlate: PAYLOAD.showPlate,
      platePosition: PAYLOAD.platePosition,
      plateFields: PAYLOAD.plateFields,
      qrUrl: PAYLOAD.qrUrl,
      corner: PAYLOAD.corner,
      scale: PAYLOAD.scale,
    });
  });
});
