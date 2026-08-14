import { describe, expect, it } from "vitest";

import {
  createStagePresetSchema,
  stagePresetConfigSchema,
  updateStagePresetSchema,
} from "./stage-presets.js";

describe("stagePresetConfigSchema", () => {
  it("accepts a preset that sets nothing", () => {
    // A preset is a bundle of what the creator deliberately changed, so an empty
    // one is meaningful: it applies nothing and every surface keeps its default.
    expect(stagePresetConfigSchema.parse({})).toEqual({});
  });

  it("keeps a field absent rather than filling in a default", () => {
    const parsed = stagePresetConfigSchema.parse({ ground: "green" });

    expect(parsed).not.toHaveProperty("scale");
    expect(parsed).not.toHaveProperty("showPlate");
  });

  it("accepts a plateFields that names one line", () => {
    expect(stagePresetConfigSchema.parse({ plateFields: { rulesText: true } })).toEqual({
      plateFields: { rulesText: true },
    });
  });

  it("distinguishes a null qrUrl from an absent one", () => {
    expect(stagePresetConfigSchema.parse({ qrUrl: null }).qrUrl).toBeNull();
    expect(stagePresetConfigSchema.parse({}).qrUrl).toBeUndefined();
  });

  it("rejects a qrUrl that is not a URL", () => {
    expect(stagePresetConfigSchema.safeParse({ qrUrl: "openrift" }).success).toBe(false);
  });

  it("holds each switch to its range", () => {
    expect(stagePresetConfigSchema.safeParse({ scale: 20 }).success).toBe(true);
    expect(stagePresetConfigSchema.safeParse({ scale: 19 }).success).toBe(false);
    expect(stagePresetConfigSchema.safeParse({ scale: 70.5 }).success).toBe(false);
    expect(stagePresetConfigSchema.safeParse({ cardScale: 0.4 }).success).toBe(true);
    expect(stagePresetConfigSchema.safeParse({ cardScale: 0.39 }).success).toBe(false);
    expect(stagePresetConfigSchema.safeParse({ tierTileStep: 0 }).success).toBe(true);
    expect(stagePresetConfigSchema.safeParse({ tierTileStep: 11 }).success).toBe(false);
    expect(stagePresetConfigSchema.safeParse({ ground: "chartreuse" }).success).toBe(false);
  });
});

describe("createStagePresetSchema", () => {
  it("trims the name", () => {
    expect(createStagePresetSchema.parse({ name: "  Draft night  ", config: {} }).name).toBe(
      "Draft night",
    );
  });

  it("rejects a name that is only whitespace", () => {
    // Caught here rather than reaching the table's name <> '' check constraint.
    expect(createStagePresetSchema.safeParse({ name: "   ", config: {} }).success).toBe(false);
  });

  it("rejects a name past 60 characters", () => {
    expect(createStagePresetSchema.safeParse({ name: "x".repeat(61), config: {} }).success).toBe(
      false,
    );
  });
});

describe("updateStagePresetSchema", () => {
  it("accepts a rename that restates no config", () => {
    expect(updateStagePresetSchema.parse({ name: "Finals" })).toEqual({ name: "Finals" });
  });

  it("accepts a config replacement that restates no name", () => {
    expect(updateStagePresetSchema.parse({ config: { showText: true } })).toEqual({
      config: { showText: true },
    });
  });
});
