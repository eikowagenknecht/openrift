import type { StagePresetConfig } from "@openrift/shared";
import { describe, expect, it } from "vitest";

import type { StagePresetRow } from "../repositories/stage-presets.js";
import { narrowStagePresetConfig, toStagePreset } from "./stage-preset-presenters.js";

const CONFIG: StagePresetConfig = {
  showPlate: true,
  platePosition: "left",
  plateFields: { rulesText: true },
  qrUrl: "https://openrift.app/decks/share/abc",
  corner: "bottom-left",
  scale: 65,
  cardScale: 0.8,
  showText: false,
  ground: "green",
  tierTileStep: 4,
};

function makeRow(overrides: Partial<StagePresetRow> = {}): StagePresetRow {
  return {
    id: "80000000-0001-4000-a000-000000000001",
    userId: "a0000000-0001-4000-a000-000000000001",
    name: "Draft night",
    config: CONFIG,
    createdAt: new Date("2026-08-01T10:30:00.000Z"),
    updatedAt: new Date("2026-08-02T11:00:00.000Z"),
    ...overrides,
  };
}

describe("toStagePreset", () => {
  it("maps a row to the owner response shape", () => {
    expect(toStagePreset(makeRow())).toEqual({
      id: "80000000-0001-4000-a000-000000000001",
      name: "Draft night",
      config: CONFIG,
    });
  });

  it("never leaks the owner or the timestamps", () => {
    const result = toStagePreset(makeRow());

    expect("userId" in result).toBe(false);
    expect("createdAt" in result).toBe(false);
    expect("updatedAt" in result).toBe(false);
  });

  it("carries an empty config through as an empty config", () => {
    expect(toStagePreset(makeRow({ config: {} })).config).toEqual({});
  });

  it("degrades a corrupt config rather than throwing", () => {
    const row = makeRow({ config: "not a config" as unknown as StagePresetConfig });

    expect(toStagePreset(row)).toEqual({
      id: "80000000-0001-4000-a000-000000000001",
      name: "Draft night",
      config: {},
    });
  });
});

describe("narrowStagePresetConfig", () => {
  it("keeps a config that is already valid", () => {
    expect(narrowStagePresetConfig(CONFIG)).toEqual(CONFIG);
  });

  it("keeps null qrUrl, which means hide the QR rather than leave it alone", () => {
    expect(narrowStagePresetConfig({ qrUrl: null })).toEqual({ qrUrl: null });
  });

  it("drops keys this build has never heard of", () => {
    expect(narrowStagePresetConfig({ scale: 40, glitter: true })).toEqual({ scale: 40 });
  });

  it("degrades a blob that is not an object at all", () => {
    expect(narrowStagePresetConfig("nope")).toEqual({});
    expect(narrowStagePresetConfig(null)).toEqual({});
    expect(narrowStagePresetConfig([1, 2, 3])).toEqual({});
  });

  it("degrades a field whose value is out of range", () => {
    expect(narrowStagePresetConfig({ scale: 900 })).toEqual({});
    expect(narrowStagePresetConfig({ ground: "chartreuse" })).toEqual({});
    expect(narrowStagePresetConfig({ cardScale: 2 })).toEqual({});
  });

  it("accepts a partial plateFields, one key deep", () => {
    expect(narrowStagePresetConfig({ plateFields: { name: false } })).toEqual({
      plateFields: { name: false },
    });
  });
});
