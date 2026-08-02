import { describe, expect, it, vi } from "vitest";

import { buildPatchUpdates } from "./patch.js";

/** Stand-in for a Kysely `Updateable<T>`: the columns these cases may write. */
interface TargetRow {
  display_name: string;
  bio_text: string;
  tag_list: string;
  user_age: number;
  status_col: string | null;
  col: unknown;
}

describe("buildPatchUpdates", () => {
  it("maps string field mappings to column names", () => {
    const result = buildPatchUpdates<TargetRow>({ name: "Alice" }, { name: "display_name" });
    expect(result.display_name).toBe("Alice");
  });

  it("applies transform functions for callable mappings", () => {
    const result = buildPatchUpdates<TargetRow>(
      { tags: ["a", "b"] },
      { tags: (v) => ["tag_list", (v as string[]).join(",")] },
    );
    expect(result.tag_list).toBe("a,b");
  });

  it("skips undefined/missing body fields", () => {
    const result = buildPatchUpdates<TargetRow>(
      { name: "Alice" },
      { name: "display_name", bio: "bio_text" },
    );
    expect(result.display_name).toBe("Alice");
    expect(result).not.toHaveProperty("bio_text");
  });

  it("throws when no valid fields are provided", () => {
    expect(() => buildPatchUpdates<TargetRow>({}, { name: "display_name" })).toThrow(
      "No fields to update",
    );
  });

  it("throws when all body fields are undefined", () => {
    expect(() => buildPatchUpdates<TargetRow>({ other: "x" }, { name: "display_name" })).toThrow(
      "No fields to update",
    );
  });

  it("does not include updatedAt (handled by DB trigger)", () => {
    const result = buildPatchUpdates<TargetRow>({ name: "Bob" }, { name: "display_name" });
    expect(result).not.toHaveProperty("updatedAt");
  });

  it("handles multiple transform functions simultaneously", () => {
    const result = buildPatchUpdates<TargetRow>(
      { name: "Alice", age: 30 },
      {
        name: (v) => ["display_name", (v as string).toUpperCase()],
        age: (v) => ["user_age", (v as number) + 1],
      },
    );
    expect(result.display_name).toBe("ALICE");
    expect(result.user_age).toBe(31);
  });

  it("handles mixed string and transform mappings", () => {
    const result = buildPatchUpdates<TargetRow>(
      { name: "Alice", tags: ["a"] },
      {
        name: "display_name",
        tags: (v) => ["tag_list", (v as string[]).join(",")],
      },
    );
    expect(result.display_name).toBe("Alice");
    expect(result.tag_list).toBe("a");
  });

  it("transform function can return null dbValue", () => {
    const result = buildPatchUpdates<TargetRow>(
      { status: "" },
      { status: () => ["status_col", null] },
    );
    expect(result.status_col).toBeNull();
  });

  it("transform function receives the actual body value", () => {
    const transform = vi.fn((v: unknown) => ["col", v] as ["col", unknown]);
    buildPatchUpdates<TargetRow>({ field: 42 }, { field: transform });
    expect(transform).toHaveBeenCalledWith(42);
  });

  it("throws AppError with status 400 and code BAD_REQUEST", () => {
    try {
      buildPatchUpdates<TargetRow>({}, { name: "display_name" });
    } catch (error: unknown) {
      const appError = error as { status: number; code: string; message: string };
      expect(appError.status).toBe(400);
      expect(appError.code).toBe("BAD_REQUEST");
      expect(appError.message).toBe("No fields to update");
    }
  });

  it("handles body key with undefined value (skips it)", () => {
    const result = buildPatchUpdates<TargetRow>(
      { name: "test", bio: undefined },
      { name: "display_name", bio: "bio_text" },
    );
    expect(result).toEqual({ display_name: "test" });
  });
});
