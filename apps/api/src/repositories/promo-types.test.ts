import { describe, expect, it } from "vitest";

import { createMockDb } from "../test/mock-db.js";
import { promoTypesRepo } from "./promo-types.js";

const ROW = {
  id: "pt-1",
  slug: "promo",
  label: "Promo",
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("promoTypesRepo", () => {
  it("listAll returns promo types", async () => {
    const db = createMockDb([ROW]);
    expect(await promoTypesRepo(db).listAll()).toEqual([ROW]);
  });

  it("getById returns a promo type", async () => {
    const db = createMockDb([ROW]);
    expect(await promoTypesRepo(db).getById("pt-1")).toEqual(ROW);
  });

  it("getBySlug returns a promo type", async () => {
    const db = createMockDb([ROW]);
    expect(await promoTypesRepo(db).getBySlug("promo")).toEqual(ROW);
  });

  it("create returns the created promo type", async () => {
    const db = createMockDb([ROW]);
    expect(await promoTypesRepo(db).create({ slug: "promo", label: "Promo" })).toEqual(ROW);
  });

  it("create with sortOrder", async () => {
    const db = createMockDb([ROW]);
    expect(
      await promoTypesRepo(db).create({ slug: "promo", label: "Promo", sortOrder: 5 }),
    ).toEqual(ROW);
  });

  it("update returns the update result", async () => {
    const db = createMockDb([ROW]);
    expect(await promoTypesRepo(db).update("pt-1", { label: "Updated" })).toEqual(ROW);
  });

  it("deleteById returns the delete result", async () => {
    const db = createMockDb([ROW]);
    expect(await promoTypesRepo(db).deleteById("pt-1")).toEqual(ROW);
  });

  it("isInUse returns a row when in use", async () => {
    const db = createMockDb([{ id: "p-1" }]);
    expect(await promoTypesRepo(db).isInUse("pt-1")).toEqual({ id: "p-1" });
  });

  it("isInUse returns undefined when not in use", async () => {
    const db = createMockDb([]);
    expect(await promoTypesRepo(db).isInUse("pt-1")).toBeUndefined();
  });

  it("reorder updates sort orders", async () => {
    const db = createMockDb([]);
    await expect(promoTypesRepo(db).reorder(["pt-1", "pt-2"])).resolves.toBeUndefined();
  });

  it("reorder is a no-op for empty array", async () => {
    const db = createMockDb([]);
    await expect(promoTypesRepo(db).reorder([])).resolves.toBeUndefined();
  });
});
