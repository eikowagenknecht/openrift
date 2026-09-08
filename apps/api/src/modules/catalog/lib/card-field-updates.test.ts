import { describe, expect, it } from "vitest";

import { AppError } from "../../../errors.js";
import { cardUpdateFor } from "./card-field-updates.js";

describe("cardUpdateFor", () => {
  it("writes the scalar fields under their own column", () => {
    expect(cardUpdateFor("name", "Ekko, Boy Who Shattered Time")).toEqual({
      name: "Ekko, Boy Who Shattered Time",
    });
    expect(cardUpdateFor("might", 4)).toEqual({ might: 4 });
    expect(cardUpdateFor("energy", 2)).toEqual({ energy: 2 });
    expect(cardUpdateFor("power", 3)).toEqual({ power: 3 });
    expect(cardUpdateFor("mightBonus", 1)).toEqual({ mightBonus: 1 });
    expect(cardUpdateFor("maxCopiesOverride", 2)).toEqual({ maxCopiesOverride: 2 });
    expect(cardUpdateFor("comment", "reprint")).toEqual({ comment: "reprint" });
  });

  it("passes null through for the nullable fields", () => {
    expect(cardUpdateFor("might", null)).toEqual({ might: null });
    expect(cardUpdateFor("maxCopiesOverride", null)).toEqual({ maxCopiesOverride: null });
    expect(cardUpdateFor("comment", null)).toEqual({ comment: null });
  });

  it("keeps tags as an array", () => {
    expect(cardUpdateFor("tags", ["signature", "champion"])).toEqual({
      tags: ["signature", "champion"],
    });
    expect(cardUpdateFor("tags", [])).toEqual({ tags: [] });
  });

  it("rejects a field it does not map with a 400", () => {
    const junctionField = "domains" as unknown as Parameters<typeof cardUpdateFor>[0];
    const call = () => cardUpdateFor(junctionField, []);
    expect(call).toThrow(AppError);
    expect(call).toThrow("Unsupported card field: domains");
    try {
      call();
    } catch (error) {
      expect((error as AppError).status).toBe(400);
    }
  });
});
