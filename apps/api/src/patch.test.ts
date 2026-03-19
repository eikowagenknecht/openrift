import { describe, expect, it } from "vitest";

import { buildPatchUpdates } from "./patch.js";

describe("buildPatchUpdates", () => {
  it("maps string field mappings to column names", () => {
    const result = buildPatchUpdates({ name: "Alice" }, { name: "display_name" });
    expect(result.display_name).toBe("Alice");
  });

  it("applies transform functions for callable mappings", () => {
    const result = buildPatchUpdates(
      { tags: ["a", "b"] },
      { tags: (v) => ["tag_list", (v as string[]).join(",")] },
    );
    expect(result.tag_list).toBe("a,b");
  });

  it("skips undefined/missing body fields", () => {
    const result = buildPatchUpdates({ name: "Alice" }, { name: "display_name", bio: "bio_text" });
    expect(result.display_name).toBe("Alice");
    expect(result).not.toHaveProperty("bio_text");
  });

  it("throws when no valid fields are provided", () => {
    expect(() => buildPatchUpdates({}, { name: "display_name" })).toThrow("No fields to update");
  });

  it("throws when all body fields are undefined", () => {
    expect(() => buildPatchUpdates({ other: "x" }, { name: "display_name" })).toThrow(
      "No fields to update",
    );
  });

  it("does not include updatedAt (handled by DB trigger)", () => {
    const result = buildPatchUpdates({ name: "Bob" }, { name: "display_name" });
    expect(result).not.toHaveProperty("updatedAt");
  });
});
