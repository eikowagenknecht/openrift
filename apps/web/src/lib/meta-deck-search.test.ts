import { describe, expect, it } from "vitest";

import { metaDeckSearchSchema } from "./meta-deck-search";

describe("metaDeckSearchSchema", () => {
  it("reads the cost bound, the sideboard preference and both value bounds", () => {
    expect(
      metaDeckSearchSchema.parse({ cost: 25, side: true, valueMin: 10, valueMax: 200 }),
    ).toMatchObject({ cost: 25, side: true, valueMin: 10, valueMax: 200 });
  });

  it("keeps a cost bound of zero", () => {
    expect(metaDeckSearchSchema.parse({ cost: 0 }).cost).toBe(0);
  });

  it("leaves every new param absent when the URL carries none", () => {
    const parsed = metaDeckSearchSchema.parse({});
    expect(parsed.cost).toBeUndefined();
    expect(parsed.side).toBeUndefined();
    expect(parsed.valueMin).toBeUndefined();
    expect(parsed.valueMax).toBeUndefined();
  });

  it("drops a negative bound rather than failing the route", () => {
    expect(metaDeckSearchSchema.parse({ cost: -5 }).cost).toBeUndefined();
    expect(metaDeckSearchSchema.parse({ valueMin: -1 }).valueMin).toBeUndefined();
  });

  it("drops a bound that is not a number", () => {
    expect(metaDeckSearchSchema.parse({ cost: "cheap" }).cost).toBeUndefined();
    expect(metaDeckSearchSchema.parse({ side: "yes" }).side).toBeUndefined();
  });
});
